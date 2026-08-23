from flask import Flask, request, jsonify
from flask_cors import CORS
import fitz
import io
import re
from collections import Counter
from PIL import Image, ImageOps, ImageFilter
import pytesseract

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

ALLOWED = {"pdf", "png", "jpg", "jpeg", "webp"}

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "have", "has", "had", "will", "would", "can", "could", "should", "into",
    "about", "which", "their", "there", "these", "those", "than", "then", "also",
    "using", "used", "use", "through", "such", "between", "within", "where", "when",
    "while", "what", "how", "why", "its", "they", "them", "his", "her", "our", "your",
    "you", "not", "but", "all", "any", "may", "more", "most", "some", "other", "each",
    "both", "one", "two", "three", "over", "under", "after", "before", "during", "very",
    "based", "provide", "provides", "provided", "include", "includes", "including",
    "document", "page", "pages", "information", "details", "following", "shown"
}

PLACEHOLDERS = [
    r"\[[^\]]+\]",
    r"<[^>]+>",
    r"\{[^}]+\}",
    r"\blorem\s+ipsum\b"
]

BAD_PHRASES = {
    "click here", "table of contents", "all rights reserved", "copyright",
    "www.", "http://", "https://", "confidential", "placeholder"
}

HEADING_NAMES = {
    "summary", "profile", "professional summary", "objective", "career objective",
    "education", "academic background", "skills", "technical skills", "core skills",
    "experience", "work experience", "professional experience", "projects",
    "project", "certifications", "certification", "achievements", "awards",
    "languages", "interests", "publications", "references", "introduction",
    "background", "problem statement", "objectives", "methodology", "implementation",
    "system architecture", "results", "discussion", "conclusion", "future scope",
    "literature review", "abstract", "keywords", "requirements", "features",
    "modules", "technologies used", "scope", "bill to", "invoice", "contact",
    "personal details", "declaration", "course details", "issuer", "recipient"
}


def normalize_line(line):
    return re.sub(r"\s+", " ", line).strip()


def clean_text(text):
    if not text:
        return ""

    text = text.replace("\x00", " ").replace("\r", "\n")

    for pattern in PLACEHOLDERS:
        text = re.sub(pattern, " ", text, flags=re.I)

    # Join words split by a PDF line break, e.g. "devel-\nopment".
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", text)

    # Common PDF/OCR separators.
    text = re.sub(r"[•▪◦●◆■►➜➤]", ". ", text)
    text = re.sub(r"\s*[|]+\s*", ". ", text)
    text = re.sub(r"\s*[•·]\s*", ". ", text)

    lines = []
    for raw in text.splitlines():
        line = normalize_line(raw)
        if not line:
            continue
        if re.fullmatch(r"(?:page\s*)?\d+(?:\s*(?:of|/)\s*\d+)?", line, re.I):
            continue
        if re.fullmatch(r"[-_=~.]{3,}", line):
            continue
        lines.append(line)

    # Remove adjacent duplicate OCR/PDF lines.
    deduped = []
    previous = ""
    for line in lines:
        key = re.sub(r"[^a-z0-9]+", " ", line.lower()).strip()
        if key and key != previous:
            deduped.append(line)
            previous = key

    text = "\n".join(deduped)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"([.!?])(?=[A-Za-z])", r"\1 ", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def preprocess_image(img):
    img = img.convert("L")
    img = ImageOps.autocontrast(img)
    img = img.filter(ImageFilter.SHARPEN)
    w, h = img.size
    longest = max(w, h)
    if longest < 2200:
        scale = 2200 / longest
        img = img.resize((int(w * scale), int(h * scale)))
    return img


def ocr_image(img):
    prepared = preprocess_image(img)
    return pytesseract.image_to_string(prepared, config="--psm 6")


def extract_pdf(data):
    doc = fitz.open(stream=data, filetype="pdf")
    pages = []
    used_ocr = False

    try:
        for page in doc:
            text = clean_text(page.get_text("text") or "")
            alnum = len(re.sub(r"\W", "", text))

            # OCR pages that have no useful text layer. This handles scanned PDFs
            # without forcing OCR over every normal text PDF page.
            if alnum < 40:
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                text = clean_text(ocr_image(img))
                used_ocr = True

            if text:
                pages.append(text)
    finally:
        doc.close()

    return clean_text("\n\n".join(pages)), used_ocr


def extract_file(file):
    name = file.filename or ""
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

    if ext not in ALLOWED:
        raise ValueError("Only PDF, PNG, JPG, JPEG and WEBP files are supported.")

    data = file.read()
    if not data:
        raise ValueError("The uploaded file is empty.")

    if ext == "pdf":
        text, used_ocr = extract_pdf(data)
    else:
        try:
            img = Image.open(io.BytesIO(data))
            text = clean_text(ocr_image(img))
            used_ocr = True
        except Exception as exc:
            raise ValueError("Invalid or unreadable image.") from exc

    if len(re.sub(r"\W", "", text)) < 20:
        raise ValueError("Not enough readable text was found in the document.")

    return text, used_ocr


# ---------------- DOCUMENT UNDERSTANDING ----------------


def word_tokens(text):
    return re.findall(r"[A-Za-z][A-Za-z0-9'’-]{2,}", text.lower())


def tokens(text):
    return word_tokens(text)


def meaningful_words(text):
    return [w for w in word_tokens(text) if w not in STOPWORDS]


def sentence_similarity(a, b):
    sa, sb = set(tokens(a)), set(tokens(b))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / max(1, min(len(sa), len(sb)))


def split_sentences(text):
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    result = []

    for part in parts:
        s = re.sub(r"^[•▪◦●◆■►➜➤\-–—]+\s*", "", part)
        s = normalize_line(s)
        if len(re.findall(r"\b\w+\b", s)) < 5:
            continue
        if is_noise(s):
            continue
        result.append(s)

    final = []
    for s in result:
        if not any(sentence_similarity(s, old) >= 0.88 for old in final):
            final.append(s)
    return final


def is_noise(sentence):
    low = sentence.lower()
    if any(p in low for p in BAD_PHRASES):
        return True
    if re.fullmatch(r"[\W\d_]+", sentence):
        return True
    return False


def looks_like_heading(line):
    s = normalize_line(line)
    if not s:
        return False

    low = re.sub(r"[^a-z ]", "", s.lower()).strip()
    if low in HEADING_NAMES:
        return True

    # OCR/PDF headings are often short title-case or uppercase lines.
    words = s.split()
    if 1 <= len(words) <= 7:
        if s.isupper() and any(c.isalpha() for c in s):
            return True
        alpha = [w for w in words if any(c.isalpha() for c in w)]
        if alpha and sum(w[:1].isupper() for w in alpha) / len(alpha) >= 0.8:
            return True
    return False


def sections(text):
    found = []
    for line in text.splitlines():
        if looks_like_heading(line):
            title = normalize_line(line).strip("-:.")
            if len(title) <= 60 and title.lower() not in {x.lower() for x in found}:
                found.append(title)
    return found


def find_name(text):
    lines = [normalize_line(x) for x in text.splitlines() if normalize_line(x)]

    # Explicit labels have the highest confidence.
    for line in lines[:80]:
        m = re.search(
            r"(?:full\s+name|student\s+name|candidate\s+name|name|student|candidate)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{2,70})$",
            line,
            re.I,
        )
        if m:
            value = normalize_line(m.group(1)).strip("-:,. ")
            if not looks_like_heading(value):
                return value

    # Common resume/certificate layout: name appears near the top.
    for line in lines[:20]:
        cleaned = re.sub(r"[^A-Za-z .'-]", "", line).strip()
        words = cleaned.split()
        low = cleaned.lower()
        excluded = {
            "resume", "curriculum vitae", "cv", "education", "skills",
            "technical skills", "professional summary", "contact", "profile",
            "developer", "engineer", "student", "certificate"
        }
        if 2 <= len(words) <= 5 and all(len(w) >= 2 for w in words):
            if low not in excluded and not any(x in low for x in excluded):
                if not re.search(r"@|\b\d{5,}\b|www\.|linkedin|github", low):
                    return cleaned
    return None


def detect_type(text, filename):
    t = text.lower()
    f = (filename or "").lower()

    groups = {
        "resume": [
            "resume", "curriculum vitae", "professional summary", "technical skills",
            "education", "experience", "projects", "certifications", "achievements",
            "work experience", "career objective", "linkedin", "github"
        ],
        "certificate": [
            "certificate", "certify that", "this is to certify", "has successfully completed",
            "awarded to", "presented to", "issued on", "certificate of", "completion certificate"
        ],
        "project report": [
            "project report", "problem statement", "objectives", "methodology",
            "implementation", "system architecture", "future scope", "project title",
            "modules", "technologies used"
        ],
        "research paper": [
            "abstract", "keywords", "literature review", "methodology", "results",
            "discussion", "references", "doi", "research paper"
        ],
        "academic document": [
            "assignment", "university", "semester", "student name", "roll number",
            "department", "laboratory", "experiment", "course", "faculty"
        ],
        "invoice": [
            "invoice", "bill to", "subtotal", "tax", "amount due", "quantity",
            "unit price", "total amount", "invoice number"
        ],
        "letter/notice": [
            "dear", "subject:", "notice", "regards", "sincerely", "hereby",
            "to whom it may concern"
        ]
    }

    scores = {kind: 0 for kind in groups}
    for kind, words in groups.items():
        for phrase in words:
            if phrase in t:
                scores[kind] += 1

    if any(x in f for x in ["resume", "cv", "curriculum"]):
        scores["resume"] += 5
    if any(x in f for x in ["certificate", "certification", "cert"]):
        scores["certificate"] += 5
    if any(x in f for x in ["project", "report"]):
        scores["project report"] += 3
    if any(x in f for x in ["research", "paper"]):
        scores["research paper"] += 3
    if any(x in f for x in ["invoice", "bill"]):
        scores["invoice"] += 5

    best = max(scores, key=scores.get)
    return best if scores[best] >= 2 else "general document"


def document_title(text, filename, doc_type):
    lines = [normalize_line(x) for x in text.splitlines() if normalize_line(x)]
    f = re.sub(r"\.[^.]+$", "", filename or "")
    f = re.sub(r"[_-]+", " ", f).strip()

    # For project reports/research papers, the first strong title line is useful.
    if doc_type in {"project report", "research paper", "certificate"}:
        for line in lines[:15]:
            if 3 <= len(line.split()) <= 16 and len(line) <= 140:
                low = line.lower()
                if low not in HEADING_NAMES and not re.search(r"^(name|student|candidate)\s*:", low):
                    return line.strip("-:.")

    return f if f else "Uploaded document"


# ---------------- SCORING / CONTENT SELECTION ----------------


def sentence_score(sentence, full_text, index=0, total=1, preferred_terms=None):
    words = tokens(sentence)
    if not words:
        return -1

    freq = Counter(w for w in tokens(full_text) if w not in STOPWORDS)
    if not freq:
        return 0

    mx = max(freq.values())
    content = sum(min(freq[w], 4) / mx for w in words if w in freq)
    content /= max(1, len(words))

    score = content
    score += 0.06 * (1 - index / max(1, total))

    wc = len(words)
    if 8 <= wc <= 34:
        score += 0.08
    if wc < 7:
        score -= 0.08
    if wc > 55:
        score -= 0.10

    low = sentence.lower()
    if any(p in low for p in BAD_PHRASES):
        score -= 0.6

    if preferred_terms:
        score += 0.12 * sum(1 for term in preferred_terms if term in low)

    return score


def select_content(text, count, preferred_terms=None, avoid=None):
    sentences = split_sentences(text)
    if not sentences:
        return []

    avoid = avoid or []
    scored = []
    for i, sentence in enumerate(sentences):
        if any(sentence_similarity(sentence, old) >= 0.82 for old in avoid):
            continue
        score = sentence_score(
            sentence, text, i, len(sentences), preferred_terms=preferred_terms
        )
        scored.append((score, i, sentence))

    scored.sort(key=lambda x: x[0], reverse=True)

    chosen = []
    for score, _, sentence in scored:
        if score < -0.15:
            continue
        if any(sentence_similarity(sentence, old) >= 0.72 for old in chosen):
            continue
        chosen.append(sentence)
        if len(chosen) >= count:
            break

    # Preserve original document order for readability.
    position = {s: i for i, s in enumerate(sentences)}
    chosen.sort(key=lambda s: position[s])
    return chosen


# ---------------- DOCUMENT-SPECIFIC SUMMARY ----------------


def resume_overview(text, length):
    name = find_name(text)
    sec = sections(text)
    low_sections = {s.lower() for s in sec}

    start = f"This is the resume/CV of {name}." if name else "This is a resume/CV presenting the candidate's professional profile."

    ordered = [
        ("education", "education"),
        ("academic background", "education"),
        ("skills", "skills"),
        ("technical skills", "technical skills"),
        ("experience", "experience"),
        ("work experience", "work experience"),
        ("projects", "projects"),
        ("certifications", "certifications"),
        ("achievements", "achievements"),
    ]

    covered = []
    for actual, label in ordered:
        if actual in low_sections and label not in covered:
            covered.append(label)

    if not covered:
        covered = ["education, skills, projects, experience, and other qualifications"]
        return start[:-1] + ", covering " + covered[0] + "."

    return start[:-1] + ", covering " + ", ".join(covered[:6]) + "."


def certificate_overview(text):
    name = find_name(text)
    low = text.lower()
    recipient = name

    # Strong recipient patterns.
    patterns = [
        r"(?:awarded|presented|issued|granted)\s+(?:to|for)\s+([A-Za-z][A-Za-z .'-]{2,70})",
        r"(?:certify that|certifies that|certificate is awarded to)\s+([A-Za-z][A-Za-z .'-]{2,70})",
    ]
    for pattern in patterns:
        m = re.search(pattern, text, re.I)
        if m:
            value = normalize_line(m.group(1)).strip("-:,. ")
            if value:
                recipient = value
                break

    if recipient:
        base = f"This is a certificate issued to {recipient}"
    else:
        base = "This is a certificate document"

    if "completion" in low or "completed" in low:
        return base + ", recognizing completion of a course, program, training, or activity."
    if "award" in low or "achievement" in low:
        return base + ", recognizing an award, achievement, or participation."
    return base + ", containing the recipient, certification/recognition details, and issuing information."


def project_overview(text):
    title = document_title(text, "", "project report")
    title_part = f' titled "{title}"' if title else ""
    return f"This is a project report{title_part}, describing the project's purpose, problem, objectives, approach, implementation, technologies, results, and/or future scope."


def research_overview(text):
    title = document_title(text, "", "research paper")
    title_part = f' on "{title}"' if title else ""
    return f"This is a research paper{title_part}, presenting the research problem or topic, background, methodology, findings, discussion, and conclusions."


def general_overview(text, filename):
    sentences = split_sentences(text)
    if not sentences:
        return "This document contains structured information."

    # A concise document-level description rather than blindly using a project sentence.
    first = sentences[0]
    first_words = first.split()[:28]
    topic = " ".join(first_words).rstrip(" ,;:")
    return f"This document contains information about {topic.lower()}"


def make_summary(text, filename, length):
    doc_type = detect_type(text, filename)
    count = {"short": 3, "medium": 5, "long": 7}.get(length, 3)

    if doc_type == "resume":
        intro = resume_overview(text, length)
        preferred = [
            "education", "skills", "experience", "projects", "certifications",
            "achievements", "technical", "degree", "internship"
        ]
    elif doc_type == "certificate":
        intro = certificate_overview(text)
        preferred = [
            "certificate", "completed", "course", "program", "training", "awarded",
            "issued", "organization", "achievement"
        ]
    elif doc_type == "project report":
        intro = project_overview(text)
        preferred = [
            "problem", "objective", "methodology", "implementation", "technology",
            "features", "results", "conclusion", "future scope", "system"
        ]
    elif doc_type == "research paper":
        intro = research_overview(text)
        preferred = [
            "abstract", "problem", "methodology", "method", "results", "findings",
            "discussion", "conclusion", "research"
        ]
    elif doc_type == "academic document":
        intro = "This is an academic document containing course, assignment, laboratory, or educational material."
        preferred = ["objective", "experiment", "method", "result", "conclusion", "course"]
    elif doc_type == "invoice":
        intro = "This is an invoice or billing document containing transaction, item, pricing, tax, and payment details."
        preferred = ["invoice", "amount", "total", "tax", "quantity", "payment", "due"]
    elif doc_type == "letter/notice":
        intro = "This is a formal letter or notice communicating specific information, instructions, or a request."
        preferred = ["subject", "request", "notice", "date", "information", "regards"]
    else:
        title = document_title(text, filename, doc_type)
        intro = f"This is a general document titled \"{title}\" containing structured information." if title else "This is a general document containing structured information."
        preferred = meaningful_words(text)[:12]

    selected = select_content(
        text,
        max(6, count + 3),
        preferred_terms=preferred,
        avoid=[intro],
    )

    result = [intro]
    for sentence in selected:
        if len(result) >= count:
            break
        if sentence_similarity(sentence, intro) >= 0.78:
            continue
        if any(sentence_similarity(sentence, old) >= 0.78 for old in result):
            continue
        result.append(sentence)

    # If the document has little extractable sentence structure, keep the overview only.
    return " ".join(result[:count]), doc_type


# ---------------- KEY POINTS ----------------


def make_key_points(text, summary, doc_type, length):
    wanted = {"short": 3, "medium": 5, "long": 7}.get(length, 3)
    candidates = split_sentences(text)
    if not candidates:
        return []

    preferred_by_type = {
        "resume": [
            "education", "skills", "experience", "projects", "certification",
            "achievement", "internship", "degree", "developer", "engineer"
        ],
        "certificate": [
            "completed", "awarded", "course", "program", "training", "issued",
            "organization", "certificate", "achievement"
        ],
        "project report": [
            "problem", "objective", "methodology", "implementation", "feature",
            "technology", "architecture", "result", "conclusion", "future"
        ],
        "research paper": [
            "problem", "methodology", "result", "finding", "discussion",
            "conclusion", "dataset", "experiment", "research"
        ],
        "academic document": [
            "objective", "experiment", "method", "result", "conclusion", "topic"
        ],
        "invoice": [
            "invoice", "item", "quantity", "price", "tax", "total", "payment", "due"
        ],
        "letter/notice": [
            "subject", "request", "notice", "date", "instruction", "information"
        ],
        "general document": []
    }

    preferred = preferred_by_type.get(doc_type, [])
    scored = []
    summary_sentences = split_sentences(summary)

    for i, sentence in enumerate(candidates):
        if any(sentence_similarity(sentence, s) >= 0.90 for s in summary_sentences):
            # Key points should add information instead of simply copying the summary.
            base_penalty = 0.12
        else:
            base_penalty = 0

        score = sentence_score(
            sentence,
            text,
            i,
            len(candidates),
            preferred_terms=preferred,
        ) - base_penalty

        low = sentence.lower()
        wc = len(tokens(sentence))
        if 8 <= wc <= 32:
            score += 0.10
        if wc < 7:
            score -= 0.20
        if any(p in low for p in BAD_PHRASES):
            score -= 0.60

        scored.append((score, i, sentence))

    scored.sort(key=lambda x: x[0], reverse=True)

    chosen = []
    for score, _, sentence in scored:
        if score < -0.10:
            continue
        if any(sentence_similarity(sentence, old) >= 0.72 for old in chosen):
            continue
        chosen.append(sentence)
        if len(chosen) >= wanted:
            break

    # Keep original document order.
    positions = {s: i for i, s in enumerate(candidates)}
    chosen.sort(key=lambda s: positions[s])

    result = []
    for point in chosen:
        point = re.sub(r"^[•▪◦●◆■►➜➤\-–—]+\s*", "", point).strip()
        point = re.sub(r"\s+", " ", point)
        if len(point.split()) > 32:
            point = " ".join(point.split()[:32]).rstrip(" ,;:") + "..."
        if point and not any(sentence_similarity(point, old) >= 0.90 for old in result):
            result.append(point)

    return result[:wanted]


# ---------------- API ----------------


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/summarize")
def summarize():
    try:
        if "file" not in request.files:
            return jsonify({"success": False, "message": "No file uploaded."}), 400

        file = request.files["file"]
        if not file.filename:
            return jsonify({"success": False, "message": "Please select a file."}), 400

        length = (request.form.get("length") or "short").lower()
        if length not in {"short", "medium", "long"}:
            length = "short"

        text, used_ocr = extract_file(file)
        summary, doc_type = make_summary(text, file.filename, length)
        key_points = make_key_points(text, summary, doc_type, length)

        return jsonify({
            "success": True,
            "summary": summary,
            "keyPoints": key_points,
            "documentType": doc_type,
            "ocrUsed": used_ocr,
            "filename": file.filename,
        })

    except fitz.FileDataError:
        return jsonify({"success": False, "message": "Invalid or unreadable PDF."}), 400
    except pytesseract.TesseractNotFoundError:
        return jsonify({
            "success": False,
            "message": "Tesseract OCR is not installed. Install Tesseract to process scanned PDFs and images."
        }), 500
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    except Exception as exc:
        app.logger.exception("Document processing error")
        return jsonify({"success": False, "message": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)