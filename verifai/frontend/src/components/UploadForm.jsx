import React, { useEffect, useState } from "react";
import * as pdfjsLib from 'pdfjs-dist';
import { getUsage, startVerification } from "../api.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

const PRIMARY = "#0f172a";
const BORDER = "#e2e8f0";

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

function RemainingBadge({ remaining }) {
  if (remaining === null) return null;

  if (remaining === 0) {
    return (
      <p style={{ fontSize: 13, color: "#b91c1c", margin: 0 }}>
        You've used all 5 free verifications. Contact{" "}
        <a href="mailto:sboggavarapu@umass.edu" style={{ color: "#b91c1c" }}>
          sboggavarapu@umass.edu
        </a>{" "}
        for continued access.
      </p>
    );
  }

  const color = remaining === 1 ? "#d97706" : "#9ca3af";
  return (
    <p style={{ fontSize: 12, color, margin: 0 }}>
      {remaining} free verification{remaining !== 1 ? "s" : ""} remaining
    </p>
  );
}

export default function UploadForm({ onStarted, user }) {
  if (!user) {
    return (
      <div style={{
        background: "#fff",
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "40px 32px",
        textAlign: "center",
      }}>
        <p style={{ color: "#374151", marginBottom: 16, fontSize: 15 }}>Sign in to verify candidates.</p>
        <a href="/login" style={{ color: PRIMARY, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
          Sign in with Google →
        </a>
      </div>
    );
  }

  const [username, setUsername] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    getUsage()
      .then((data) => setRemaining(data.remaining))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setError(null);
    try {
      let resumeText = null;
      if (pdfFile) resumeText = await extractPdfText(pdfFile);
      const data = await startVerification(username.trim(), resumeText);
      setRemaining(data.verifications_remaining ?? null);
      onStarted(data.run_id, username.trim());
    } catch (err) {
      setError(err.message);
      getUsage().then((d) => setRemaining(d.remaining)).catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  const isExhausted = remaining === 0;
  const isDisabled = loading || !username.trim() || isExhausted;

  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "28px 28px 24px" }}>
      {error && (
        <div style={{
          background: "#fef2f2",
          color: "#b91c1c",
          borderRadius: 6,
          padding: "10px 14px",
          marginBottom: 20,
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20, marginBottom: 20 }}>
          {/* GitHub Username */}
          <div>
            <label style={{
              display: "block",
              fontSize: 11,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}>
              GitHub Username
            </label>
            <div style={{ position: "relative" }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="#9ca3af"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <input
                style={{
                  width: "100%",
                  padding: "10px 12px 10px 34px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  color: PRIMARY,
                }}
                placeholder="e.g. octocat"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0" }}>
              Public GitHub handle only — not a full URL
            </p>
          </div>

          {/* Resume PDF */}
          <div>
            <label style={{
              display: "block",
              fontSize: 11,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}>
              Resume PDF <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
            </label>
            <div
              onClick={() => !loading && document.getElementById("pdf-input").click()}
              style={{
                border: `1.5px dashed ${BORDER}`,
                borderRadius: 6,
                padding: "18px 12px",
                textAlign: "center",
                cursor: loading ? "default" : "pointer",
                color: pdfFile ? "#374151" : "#9ca3af",
                fontSize: 13,
                background: "#fafafa",
              }}
            >
              {pdfFile ? `✓ ${pdfFile.name}` : "Drag & drop, or browse"}
            </div>
            <input
              id="pdf-input"
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => setPdfFile(e.target.files[0] || null)}
            />
            <p style={{ fontSize: 11, color: "#9ca3af", margin: "6px 0 0" }}>
              Text extracted client-side before sending
            </p>
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
          <RemainingBadge remaining={remaining} />
          <button
            type="submit"
            disabled={isDisabled}
            style={{
              padding: "11px 22px",
              background: isDisabled ? "#94a3b8" : PRIMARY,
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: isDisabled ? "not-allowed" : "pointer",
              letterSpacing: "-0.01em",
              flexShrink: 0,
            }}
          >
            {loading ? "Starting…" : "Run verification →"}
          </button>
        </div>
      </form>
    </div>
  );
}
