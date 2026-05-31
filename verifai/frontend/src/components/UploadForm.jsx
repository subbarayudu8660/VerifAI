import React, { useState } from "react";
import * as pdfjsLib from 'pdfjs-dist';
import { startVerification } from "../api.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

const s = {
  card: { background: "#fff", borderRadius: 12, padding: "2rem", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", maxWidth: 540, margin: "0 auto" },
  label: { display: "block", fontWeight: 600, marginBottom: 6, fontSize: 14, color: "#374151" },
  input: { width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: 8, fontSize: 15, outline: "none", marginBottom: 18 },
  fileBox: { border: "1.5px dashed #c7d2fe", borderRadius: 8, padding: "1.2rem", textAlign: "center", cursor: "pointer", marginBottom: 18, color: "#6366f1", fontSize: 14 },
  btn: { width: "100%", padding: "12px", background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600, cursor: "pointer" },
  btnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  hint: { fontSize: 12, color: "#9ca3af", marginTop: 4 },
  error: { background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 14 },
};

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text.trim();
}

export default function UploadForm({ onStarted }) {
  const [username, setUsername] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    try {
      let resumeText = null;
      if (pdfFile) resumeText = await extractPdfText(pdfFile);
      const { run_id } = await startVerification(username.trim(), resumeText);
      onStarted(run_id, username.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.card}>
      <h2 style={{ marginBottom: "1.5rem", fontSize: 20 }}>Verify a Candidate</h2>
      {error && <div style={s.error}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <label style={s.label}>GitHub Username</label>
        <input
          style={s.input}
          placeholder="e.g. torvalds"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
        />
        <label style={s.label}>Resume (optional)</label>
        <div
          style={s.fileBox}
          onClick={() => !loading && document.getElementById("pdf-input").click()}
        >
          {pdfFile ? `✓ ${pdfFile.name}` : "Click to upload a PDF resume"}
        </div>
        <input
          id="pdf-input"
          type="file"
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(e) => setPdfFile(e.target.files[0] || null)}
        />
        <p style={s.hint}>PDF text will be extracted client-side before sending.</p>
        <br />
        <button
          type="submit"
          style={{ ...s.btn, ...(loading || !username.trim() ? s.btnDisabled : {}) }}
          disabled={loading || !username.trim()}
        >
          {loading ? "Starting…" : "Run Verification"}
        </button>
      </form>
    </div>
  );
}
