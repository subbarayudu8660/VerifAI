import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getResults } from "../api";
import ReportView from "./ReportView.jsx";

const PRIMARY = "#0f172a";
const BORDER = "#e2e8f0";

export default function ReportPage() {
  const { runId } = useParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getResults(runId)
      .then((data) => {
        if (data.final_report) setState(data);
        else setError("Report not found or still processing.");
      })
      .catch(() => setError("Report not found."));
  }, [runId]);

  if (error) {
    return (
      <div style={{
        textAlign: "center",
        padding: "60px 24px",
        fontFamily: "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
        <h2 style={{ color: PRIMARY, marginBottom: 16, letterSpacing: "-0.02em" }}>{error}</h2>
        <a href="/" style={{ color: PRIMARY, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
          Run your own verification →
        </a>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{
        textAlign: "center",
        padding: "60px",
        color: "#64748b",
        fontFamily: "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif",
      }}>
        Loading report…
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8fafc",
      fontFamily: "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif",
    }}>
      <nav style={{
        background: "#fff",
        borderBottom: `1px solid ${BORDER}`,
        padding: "0 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: 56,
      }}>
        <a href="/" style={{ fontSize: 17, fontWeight: 800, color: PRIMARY, textDecoration: "none", letterSpacing: "-0.03em" }}>
          VerifAI
        </a>
        <a href="/" style={{ fontSize: 14, color: "#64748b", textDecoration: "none" }}>
          Run your own verification →
        </a>
      </nav>

      <div style={{ padding: "32px 24px" }}>
        <ReportView state={{ ...state, run_id: runId }} onReset={() => { window.location.href = "/verify"; }} />
      </div>
    </div>
  );
}
