

# Document Summary Assistant

A full-stack document summarization app built with React + Vite on the frontend and Python Flask on the backend.

## Live Application

https://document-summary-assistantu.netlify.app/

## Features

- Upload PDF, PNG, JPG, JPEG, and WEBP files
- Drag-and-drop or file picker upload
- Extracts text from PDFs using PyMuPDF
- Extracts text from images using Tesseract OCR via pytesseract
- Generates summaries in short, medium, and long modes
- Shows key points as concise bullet-style points
- Includes loading states and user-friendly error messages

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
Install backend dependencies:

Bash

pip install -r backend/requirements.txt
Install Tesseract OCR on your machine. On macOS with Homebrew:

Bash

brew install tesseract
Install frontend dependencies:

Bash

cd frontend
npm install
Run the app
Start the backend from the project root:

Bash

cd /Users/tejaswi/Desktop/document-summary-assistant
source .venv/bin/activate
cd backend
flask --app app run --debug --host 0.0.0.0 --port 5001
Start the frontend in a separate terminal:

Bash

cd /Users/tejaswi/Desktop/document-summary-assistant/frontend
npm run dev
Open the app in a browser at:


http://localhost:5173
Backend API
Health check
Bash

curl http://localhost:5001/
Summarize document
Bash

curl -X POST http://localhost:5001/api/summarize \
  -F "file=@example.pdf" \
  -F "length=medium"
