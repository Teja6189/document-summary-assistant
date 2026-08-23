import { useRef, useState } from "react";

const API_BASE_URL = "http://localhost:5001";

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

  return `${value.toFixed(
    value >= 10 || index === 0 ? 0 : 1
  )} ${units[index]}`;
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

  // --------------------------------------------------
  // CLEAR MESSAGES
  // --------------------------------------------------

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  // --------------------------------------------------
  // VALIDATE FILE
  // --------------------------------------------------

  const validateFile = (file) => {
    if (!file) {
      setError("Please select a file.");
      return false;
    }

    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase();

    const allowed = [
      "pdf",
      "png",
      "jpg",
      "jpeg",
      "webp",
    ];

    if (!allowed.includes(extension)) {
      setError(
        "Unsupported file type. Please upload PDF, PNG, JPG, JPEG, or WEBP."
      );

      return false;
    }

    if (file.size === 0) {
      setError(
        "The uploaded file is empty. Please choose another file."
      );

      return false;
    }

    // 50 MB frontend check
    if (file.size > 50 * 1024 * 1024) {
      setError(
        "File is too large. Maximum allowed size is 50 MB."
      );

      return false;
    }

    return true;
  };

  // --------------------------------------------------
  // FILE SELECTION
  // --------------------------------------------------

  const handleFileSelection = (file) => {
    clearMessages();

    setSummary("");
    setKeyPoints([]);

    if (!file) {
      return;
    }

    if (!validateFile(file)) {
      return;
    }

    setSelectedFile(file);
  };

  // --------------------------------------------------
  // INPUT CHANGE
  // --------------------------------------------------

  const handleInputChange = (event) => {
    const file = event.target.files?.[0];

    handleFileSelection(file);
  };

  // --------------------------------------------------
  // DRAG AND DROP
  // --------------------------------------------------

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];

    handleFileSelection(file);
  };

  // --------------------------------------------------
  // REMOVE FILE
  // --------------------------------------------------

  const removeFile = () => {
    setSelectedFile(null);

    setSummary("");
    setKeyPoints([]);

    clearMessages();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // --------------------------------------------------
  // OPEN FILE SELECTOR
  // --------------------------------------------------

  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  // --------------------------------------------------
  // GENERATE SUMMARY
  // --------------------------------------------------

  const handleGenerateSummary = async () => {
    if (!selectedFile) {
      setError(
        "Please choose a document before generating a summary."
      );

      return;
    }

    setIsLoading(true);

    setError("");
    setSuccess("");

    setSummary("");
    setKeyPoints([]);

    const formData = new FormData();

    formData.append("file", selectedFile);
    formData.append("length", summaryLength);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/summarize`,
        {
          method: "POST",
          body: formData,
        }
      );

      // ------------------------------------------------
      // SAFE RESPONSE HANDLING
      // Prevents "Unexpected end of JSON input"
      // ------------------------------------------------

      const contentType =
        response.headers.get("content-type") || "";

      let data = null;

      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();

        throw new Error(
          text ||
            `Server returned HTTP ${response.status}.`
        );
      }

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message ||
            `Server error: HTTP ${response.status}`
        );
      }

      setSummary(data.summary || "");

      setKeyPoints(
        Array.isArray(data.keyPoints)
          ? data.keyPoints
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
        fetchError.message.toLowerCase().includes("fetch")
      ) {
        setError(
          "Cannot connect to the backend. Please make sure app.py is running on http://localhost:5001."
        );
      } else {
        setError(
          fetchError.message ||
            "Unable to process the document."
        );
      }

      setSummary("");
      setKeyPoints([]);
    } finally {
      setIsLoading(false);
    }
  };

  // --------------------------------------------------
  // KEYBOARD ACCESS FOR DROPZONE
  // --------------------------------------------------

  const handleDropzoneKeyDown = (event) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      openFileSelector();
    }
  };

  return (
    <div className="app-shell">
      <div className="app-card">

        {/* =========================================
            HEADER
        ========================================== */}

        <header className="app-header">
          <p className="eyebrow">
            DOCUMENT INTELLIGENCE
          </p>

          <h1>
            Document Summary Assistant
          </h1>

          <p className="header-description">
            Upload a PDF or image and get an automatic
            summary with important key points.
          </p>
        </header>

        {/* =========================================
            UPLOAD SECTION
        ========================================== */}

        <section className="panel upload-panel">

          <div className="section-header">
            <h2>Upload Document</h2>
          </div>

          <div
            className={`dropzone ${
              isDragging ? "dragging" : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={openFileSelector}
            onKeyDown={handleDropzoneKeyDown}
            role="button"
            tabIndex={0}
          >

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleInputChange}
              hidden
            />

            <div className="dropzone-icon">
              ↑
            </div>

            <p className="dropzone-title">
              Drag and drop a file here
            </p>

            <p className="dropzone-subtitle">
              or click to browse
            </p>

            <span className="supported-files">
              Supported: PDF, PNG, JPG, JPEG, WEBP
            </span>

          </div>

          {/* SELECTED FILE */}

          {selectedFile ? (
            <div className="file-meta">

              <div className="file-information">

                <span className="file-label">
                  SELECTED FILE
                </span>

                <p
                  className="file-name"
                  title={selectedFile.name}
                >
                  {selectedFile.name}
                </p>

              </div>

              <div className="file-meta-right">

                <span className="file-size">
                  {formatFileSize(
                    selectedFile.size
                  )}
                </span>

                <button
                  type="button"
                  className="remove-file"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeFile();
                  }}
                >
                  Remove
                </button>

              </div>

            </div>
          ) : (
            <p className="helper-text">
              No file selected yet.
            </p>
          )}

        </section>

        {/* =========================================
            SUMMARY LENGTH
        ========================================== */}

        <section className="panel">

          <div className="section-header">
            <h2>Summary Length</h2>
          </div>

          <div
            className="length-selector"
            aria-label="Summary length selector"
          >

            {SUMMARY_OPTIONS.map(
              (option) => (
                <button
                  key={option.value}
                  type="button"
                  className={
                    summaryLength ===
                    option.value
                      ? "length-option active"
                      : "length-option"
                  }
                  onClick={() =>
                    setSummaryLength(
                      option.value
                    )
                  }
                >
                  {option.label}
                </button>
              )
            )}

          </div>

          <button
            type="button"
            className="generate-btn"
            onClick={handleGenerateSummary}
            disabled={
              !selectedFile ||
              isLoading
            }
          >

            {isLoading ? (
              <span className="loading-content">
                <span className="spinner"></span>
                Processing Document...
              </span>
            ) : (
              "Generate Summary"
            )}

          </button>

        </section>

        {/* =========================================
            ERROR
        ========================================== */}

        {error && (
          <div className="alert error">
            <strong>Error:</strong>
            <span>{error}</span>
          </div>
        )}

        {/* =========================================
            SUCCESS
        ========================================== */}

        {success && !error && (
          <div className="alert success">
            {success}
          </div>
        )}

        {/* =========================================
            SUMMARY
        ========================================== */}

        <section className="panel summary-panel">

          <div className="section-header">
            <h2>Summary</h2>
          </div>

          {summary ? (
            <div className="summary-content">
              <p className="summary-text">
                {summary}
              </p>
            </div>
          ) : (
            <p className="placeholder">
              Your summary will appear here.
            </p>
          )}

        </section>

        {/* =========================================
            KEY POINTS
        ========================================== */}

        <section className="panel key-points-panel">

          <div className="section-header">
            <h2>Key Points</h2>
          </div>

          {keyPoints.length > 0 ? (
            <ul className="key-points-list">

              {keyPoints.map(
                (point, index) => (
                  <li
                    key={`${index}-${point}`}
                  >
                    {point}
                  </li>
                )
              )}

            </ul>
          ) : (
            <p className="placeholder">
              Key points will be listed here.
            </p>
          )}

        </section>

      </div>

      {/* =========================================
          CSS
      ========================================== */}

      <style>{`

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family:
            Georgia,
            "Times New Roman",
            serif;
          background: #eef4ff;
          color: #13294b;
        }

        button,
        input {
          font-family: inherit;
        }

        .app-shell {
          min-height: 100vh;
          padding: 36px 20px;
          background:
            linear-gradient(
              135deg,
              #eef4ff 0%,
              #f8fbff 50%,
              #edf3ff 100%
            );
        }

        .app-card {
          width: 100%;
          max-width: 785px;
          margin: 0 auto;
          padding: 30px 24px;
          background: #ffffff;
          border-radius: 22px;
          box-shadow:
            0 20px 55px
            rgba(31, 62, 110, 0.12);
        }

        .app-header {
          margin-bottom: 24px;
        }

        .eyebrow {
          margin: 0 0 10px;
          color: #1265d8;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
        }

        h1 {
          margin: 0;
          color: #102744;
          font-size: 39px;
          line-height: 1.12;
        }

        .header-description {
          margin: 12px 0 0;
          color: #64748b;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          font-size: 14px;
          line-height: 1.6;
        }

        .panel {
          margin-top: 16px;
          padding: 16px;
          border: 1px solid #e5ebf5;
          border-radius: 16px;
          background: #fbfcfe;
        }

        .section-header {
          margin-bottom: 14px;
        }

        .section-header h2 {
          margin: 0;
          color: #162d4b;
          font-size: 17px;
        }

        .dropzone {
          min-height: 172px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 25px;
          border: 2px dashed #b8cff4;
          border-radius: 15px;
          background: #f8fbff;
          cursor: pointer;
          transition: 0.2s ease;
          text-align: center;
        }

        .dropzone:hover,
        .dropzone.dragging {
          border-color: #2176e8;
          background: #eef6ff;
        }

        .dropzone-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
          border-radius: 14px;
          background: #dcecff;
          color: #075abb;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          font-size: 32px;
          font-weight: bold;
        }

        .dropzone-title {
          margin: 0;
          color: #172c49;
          font-size: 15px;
          font-weight: bold;
        }

        .dropzone-subtitle {
          margin: 8px 0;
          color: #71819a;
          font-size: 13px;
        }

        .supported-files {
          color: #71819a;
          font-size: 11px;
        }

        .helper-text {
          margin: 10px 0 0;
          color: #64748b;
          font-size: 12px;
        }

        .file-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 12px;
          padding: 13px;
          border: 1px solid #e5eaf2;
          border-radius: 12px;
          background: #ffffff;
        }

        .file-information {
          min-width: 0;
          flex: 1;
        }

        .file-label {
          display: block;
          margin-bottom: 5px;
          color: #8290a5;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          font-size: 9px;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }

        .file-name {
          margin: 0;
          overflow: hidden;
          color: #1b304e;
          font-size: 13px;
          font-weight: bold;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-meta-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .file-size {
          color: #66758c;
          font-size: 12px;
        }

        .remove-file {
          padding: 8px 12px;
          border: 1px solid #dce4ef;
          border-radius: 9px;
          background: #ffffff;
          color: #263d5b;
          cursor: pointer;
          font-size: 12px;
        }

        .remove-file:hover {
          border-color: #d95d5d;
          color: #c62828;
        }

        .length-selector {
          display: flex;
          gap: 10px;
          margin-bottom: 14px;
        }

        .length-option {
          padding: 9px 17px;
          border: 1px solid #dfe6f0;
          border-radius: 22px;
          background: #ffffff;
          color: #263c59;
          cursor: pointer;
          font-weight: bold;
        }

        .length-option:hover {
          border-color: #2677e8;
        }

        .length-option.active {
          border-color: #2476e8;
          background: #2476e8;
          color: #ffffff;
        }

        .generate-btn {
          width: 100%;
          min-height: 43px;
          border: none;
          border-radius: 10px;
          background:
            linear-gradient(
              90deg,
              #2378ec,
              #1651a6
            );
          color: white;
          cursor: pointer;
          font-weight: bold;
          transition: 0.2s ease;
        }

        .generate-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow:
            0 8px 20px
            rgba(31, 103, 207, 0.2);
        }

        .generate-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .loading-content {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid
            rgba(255, 255, 255, 0.45);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .alert {
          display: flex;
          gap: 6px;
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 10px;
          font-family:
            Arial,
            Helvetica,
            sans-serif;
          font-size: 12px;
          line-height: 1.5;
        }

        .alert.error {
          border: 1px solid #ffd0d0;
          background: #fff2f2;
          color: #b42323;
        }

        .alert.success {
          border: 1px solid #ccebd8;
          background: #f0fff5;
          color: #18753d;
        }

        .summary-content {
          padding: 2px;
        }

        .summary-text {
          margin: 0;
          color: #334155;
          font-size: 14px;
          line-height: 1.8;
          white-space: pre-wrap;
        }

        .placeholder {
          margin: 0;
          color: #7c899c;
          font-size: 13px;
        }

        .key-points-list {
          margin: 0;
          padding-left: 22px;
          color: #334155;
        }

        .key-points-list li {
          margin-bottom: 9px;
          padding-left: 4px;
          font-size: 13px;
          line-height: 1.6;
        }

        .key-points-list li::marker {
          color: #2176e8;
        }

        @media (max-width: 600px) {

          .app-shell {
            padding: 15px 10px;
          }

          .app-card {
            padding: 22px 14px;
            border-radius: 16px;
          }

          h1 {
            font-size: 29px;
          }

          .file-meta {
            align-items: flex-start;
            flex-direction: column;
          }

          .file-meta-right {
            width: 100%;
            justify-content: space-between;
          }

          .length-selector {
            flex-wrap: wrap;
          }

        }

      `}</style>
    </div>
  );
}

export default App;