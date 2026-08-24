import { useRef, useState } from "react";
import "./App.css";

const API_BASE_URL =
  "https://document-summary-assistant-1-6wc9.onrender.com";

const SUMMARY_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.webp";

const formatFileSize = (bytes) => {
  if (!bytes) return "0 Bytes";

  const units = ["Bytes", "KB", "MB", "GB"];

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${
    units[index]
  }`;
};

function App() {
  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);

  const [summaryLength, setSummaryLength] = useState("medium");

  const [summary, setSummary] = useState("");

  const [keyPoints, setKeyPoints] = useState([]);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const [isDragging, setIsDragging] = useState(false);

  // =========================================================
  // CLEAR MESSAGES
  // =========================================================

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  // =========================================================
  // VALIDATE FILE
  // =========================================================

  const validateFile = (file) => {
    if (!file) {
      setError("Please select a file.");
      return false;
    }

    const allowedMimeTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
    ];

    const fileExtension = `.${file.name
      .split(".")
      .pop()
      .toLowerCase()}`;

    const isValidType =
      allowedMimeTypes.includes(file.type) ||
      ACCEPTED_TYPES.includes(fileExtension);

    if (!isValidType) {
      setError(
        "Unsupported file type. Please select a PDF, PNG, JPG, JPEG, or WEBP file."
      );
      return false;
    }

    // 10 MB maximum
    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {
      setError("File size must be less than 10 MB.");
      return false;
    }

    return true;
  };

  // =========================================================
  // SELECT FILE
  // =========================================================

  const handleFileSelect = (file) => {
    clearMessages();

    if (!validateFile(file)) {
      return;
    }

    setSelectedFile(file);

    setSummary("");

    setKeyPoints([]);
  };

  // =========================================================
  // FILE INPUT
  // =========================================================

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (file) {
      handleFileSelect(file);
    }
  };

  // =========================================================
  // OPEN FILE SELECTOR
  // =========================================================

  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  // =========================================================
  // DRAG OVER
  // =========================================================

  const handleDragOver = (event) => {
    event.preventDefault();

    event.stopPropagation();

    setIsDragging(true);
  };

  // =========================================================
  // DRAG LEAVE
  // =========================================================

  const handleDragLeave = (event) => {
    event.preventDefault();

    event.stopPropagation();

    setIsDragging(false);
  };

  // =========================================================
  // DROP FILE
  // =========================================================

  const handleDrop = (event) => {
    event.preventDefault();

    event.stopPropagation();

    setIsDragging(false);

    const files = event.dataTransfer.files;

    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];

    handleFileSelect(file);
  };

  // =========================================================
  // REMOVE FILE
  // =========================================================

  const removeFile = () => {
    setSelectedFile(null);

    setSummary("");

    setKeyPoints([]);

    clearMessages();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // =========================================================
  // GENERATE SUMMARY
  // =========================================================

  const handleGenerateSummary = async () => {
    clearMessages();

    if (!selectedFile) {
      setError("Please select a file first.");
      return;
    }

    setIsLoading(true);

    setSummary("");

    setKeyPoints([]);

    try {
      const formData = new FormData();

      formData.append("file", selectedFile);

      formData.append("length", summaryLength);

      const response = await fetch(
        `${API_BASE_URL}/api/summarize`,
        {
          method: "POST",
          body: formData,
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Unable to process the document."
        );
      }

      setSummary(data.summary || "");

      setKeyPoints(
        Array.isArray(data.keyPoints)
          ? data.keyPoints
          : Array.isArray(data.key_points)
          ? data.key_points
          : []
      );

      setSuccess(
        "Document processed successfully."
      );
    } catch (fetchError) {
      console.error(
        "Document processing error:",
        fetchError
      );

      if (
        fetchError instanceof TypeError &&
        fetchError.message
          .toLowerCase()
          .includes("fetch")
      ) {
        setError(
          "Cannot connect to the backend. Please make sure the backend is running on Render."
        );
      } else {
        setError(
          fetchError.message ||
            "Unable to process the document."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================
  // CLEAR EVERYTHING
  // =========================================================

  const clearAll = () => {
    setSelectedFile(null);

    setSummary("");

    setKeyPoints([]);

    setError("");

    setSuccess("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // =========================================================
  // COPY SUMMARY
  // =========================================================

  const copySummary = async () => {
    if (!summary) {
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);

      setSuccess("Summary copied to clipboard.");

      setTimeout(() => {
        setSuccess("");
      }, 2000);
    } catch (error) {
      console.error("Copy failed:", error);

      setError("Unable to copy the summary.");
    }
  };

  // =========================================================
  // DOWNLOAD SUMMARY
  // =========================================================

  const downloadSummary = () => {
    if (!summary) {
      return;
    }

    const content = [
      "DOCUMENT SUMMARY",
      "================",
      "",
      summary,
      "",
      "KEY POINTS",
      "===========",
      "",
      ...keyPoints.map(
        (point, index) => `${index + 1}. ${point}`
      ),
    ].join("\n");

    const blob = new Blob([content], {
      type: "text/plain",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = "document-summary.txt";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="app-container">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <header className="app-header">

        <div className="header-content">

          <div className="logo-area">

            <div className="logo-icon">
              📄
            </div>

            <div>
              <h1>
                Document Summary Assistant
              </h1>

              <p>
                Transform lengthy documents into
                simple and meaningful summaries.
              </p>
            </div>

          </div>

        </div>

      </header>

      {/* =====================================================
          MAIN
      ====================================================== */}

      <main className="main-content">

        {/* ===================================================
            UPLOAD CARD
        ==================================================== */}

        <section className="card upload-card">

          <div className="section-heading">

            <h2>
              Upload Your Document
            </h2>

            <p>
              Upload a document and let the assistant
              generate a concise summary.
            </p>

          </div>

          <div
            className={`upload-area ${
              isDragging ? "dragging" : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={openFileSelector}
          >

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileChange}
              hidden
            />

            <div className="upload-icon">
              ⬆️
            </div>

            <h3>
              Drag & Drop your file here
            </h3>

            <p>
              or
            </p>

            <button
              type="button"
              className="browse-button"
              onClick={(event) => {
                event.stopPropagation();

                openFileSelector();
              }}
            >
              Browse Files
            </button>

            <p className="supported-text">
              Supported formats: PDF, PNG, JPG,
              JPEG, WEBP
            </p>

            <p className="supported-text">
              Maximum file size: 10 MB
            </p>

          </div>

          {/* =================================================
              SELECTED FILE
          ================================================== */}

          {selectedFile && (

            <div className="selected-file">

              <div className="file-info">

                <div className="file-icon">
                  📄
                </div>

                <div className="file-details">

                  <strong>
                    {selectedFile.name}
                  </strong>

                  <span>
                    {formatFileSize(
                      selectedFile.size
                    )}
                  </span>

                </div>

              </div>

              <button
                type="button"
                className="remove-button"
                onClick={removeFile}
              >
                Remove
              </button>

            </div>

          )}

        </section>

        {/* ===================================================
            SUMMARY SETTINGS
        ==================================================== */}

        <section className="card settings-card">

          <div className="section-heading">

            <h2>
              Summary Length
            </h2>

            <p>
              Choose how detailed you want your
              summary to be.
            </p>

          </div>

          <div className="summary-options">

            {SUMMARY_OPTIONS.map((option) => (

              <button
                key={option.value}
                type="button"
                className={`summary-option ${
                  summaryLength === option.value
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setSummaryLength(option.value)
                }
              >

                <span>
                  {option.label}
                </span>

                {option.value === "short" && (
                  <small>
                    Quick overview
                  </small>
                )}

                {option.value === "medium" && (
                  <small>
                    Balanced summary
                  </small>
                )}

                {option.value === "long" && (
                  <small>
                    Detailed summary
                  </small>
                )}

              </button>

            ))}

          </div>

          {/* =================================================
              GENERATE BUTTON
          ================================================== */}

          <button
            type="button"
            className="generate-button"
            disabled={
              !selectedFile || isLoading
            }
            onClick={handleGenerateSummary}
          >

            {isLoading ? (
              <>
                <span className="loading-spinner">
                  ⟳
                </span>

                Processing Document...
              </>
            ) : (
              <>
                ✨ Generate Summary
              </>
            )}

          </button>

        </section>

        {/* ===================================================
            ERROR MESSAGE
        ==================================================== */}

        {error && (

          <div className="message error-message">

            <span>
              ❌
            </span>

            <span>
              {error}
            </span>

          </div>

        )}

        {/* ===================================================
            SUCCESS MESSAGE
        ==================================================== */}

        {success && (

          <div className="message success-message">

            <span>
              ✅
            </span>

            <span>
              {success}
            </span>

          </div>

        )}

        {/* ===================================================
            SUMMARY RESULT
        ==================================================== */}

        {summary && (

          <section className="card result-card">

            <div className="result-header">

              <div>

                <h2>
                  Summary
                </h2>

                <p>
                  Generated from your uploaded
                  document.
                </p>

              </div>

              <div className="result-actions">

                <button
                  type="button"
                  onClick={copySummary}
                >
                  📋 Copy
                </button>

                <button
                  type="button"
                  onClick={downloadSummary}
                >
                  ⬇️ Download
                </button>

              </div>

            </div>

            <div className="summary-box">

              <p>
                {summary}
              </p>

            </div>

          </section>

        )}

        {/* ===================================================
            KEY POINTS
        ==================================================== */}

        {keyPoints.length > 0 && (

          <section className="card result-card">

            <div className="result-header">

              <div>

                <h2>
                  Key Points
                </h2>

                <p>
                  Important information extracted
                  from the document.
                </p>

              </div>

            </div>

            <div className="key-points-container">

              <ul className="key-points">

                {keyPoints.map(
                  (point, index) => (

                    <li key={index}>

                      <span className="point-number">
                        {index + 1}
                      </span>

                      <span>
                        {point}
                      </span>

                    </li>

                  )
                )}

              </ul>

            </div>

          </section>

        )}

        {/* ===================================================
            CLEAR BUTTON
        ==================================================== */}

        {(summary || keyPoints.length > 0) && (

          <div className="clear-section">

            <button
              type="button"
              className="clear-button"
              onClick={clearAll}
            >
              Clear Results
            </button>

          </div>

        )}

        {/* ===================================================
            EMPTY STATE
        ==================================================== */}

        {!summary &&
          keyPoints.length === 0 &&
          !isLoading &&
          !error && (

            <section className="info-section">

              <div className="info-card">

                <div className="info-icon">
                  📑
                </div>

                <h3>
                  How it works
                </h3>

                <p>
                  Upload your document, choose
                  the summary length, and click
                  Generate Summary.
                </p>

              </div>

              <div className="info-card">

                <div className="info-icon">
                  ⚡
                </div>

                <h3>
                  Fast Processing
                </h3>

                <p>
                  The document is processed by
                  the backend and returned as an
                  easy-to-understand summary.
                </p>

              </div>

              <div className="info-card">

                <div className="info-icon">
                  🔑
                </div>

                <h3>
                  Key Points
                </h3>

                <p>
                  Important points are extracted
                  separately for quick reading.
                </p>

              </div>

            </section>

          )}

      </main>

      {/* =====================================================
          FOOTER
      ====================================================== */}

      <footer className="app-footer">

        <p>
          Document Summary Assistant
        </p>

        <p>
          Upload • Summarize • Understand
        </p>

      </footer>

    </div>
  );
}

export default App;