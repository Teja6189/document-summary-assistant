# Document Summary Assistant

A full-stack document summarization app built with React + Vite on the frontend and Python Flask on the backend.

## Features

- Upload PDF, PNG, JPG, JPEG, and WEBP files
- Drag-and-drop or file picker upload
- Extracts text from PDFs using PyMuPDF
- Extracts text from images using Tesseract OCR via pytesseract
- Generates summaries in short, medium, and long modes
- Shows key points as concise bullet-style points
- Includes loading states and user-friendly error messages

https://document-summary-assistantu.netlify.app/

## Project structure

- `frontend/` - React + Vite frontend
- `backend/` - Flask API for extraction and summarization
- `.gitignore` - standard ignore rules

## Local setup

1. Create and activate a Python virtual environment:

   ```bash
   cd /Users/tejaswi/Desktop/document-summary-assistant
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install backend dependencies:

   ```bash
   pip install -r backend/requirements.txt
   ```

3. Install Tesseract OCR on your machine. On macOS with Homebrew:

   ```bash
   brew install tesseract
   ```

4. Install frontend dependencies:

   ```bash
   cd frontend
   npm install
   ```

## Run the app

Start the backend from the project root:

```bash
cd /Users/tejaswi/Desktop/document-summary-assistant
source .venv/bin/activate
cd backend
flask --app app run --debug --host 0.0.0.0 --port 5001
```

Start the frontend in a separate terminal:

```bash
cd /Users/tejaswi/Desktop/document-summary-assistant/frontend
npm run dev
```

Open the app in a browser at:

```text
http://localhost:5173
```

## Backend API

### Health check

```bash
curl http://localhost:5001/
```

### Summarize document

```bash
curl -X POST http://localhost:5001/api/summarize \
  -F "file=@example.pdf" \
  -F "length=medium"
```

## Notes

- The frontend uses a Vite proxy so `/api` requests are forwarded to the Flask backend.
- The backend is configured to run on port 5001 to avoid a system-level port conflict on port 5000.
- Supported uploads are PDF, PNG, JPG, JPEG, and WEBP.
- If the document has no readable text, the API returns a helpful error.

