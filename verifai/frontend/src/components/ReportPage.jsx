import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getResults } from "../api";
import ReportView from "./ReportView.jsx";

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
      <div style={{ textAlign: "center", padding: "60px", fontFamily: "system-ui" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: "#111", marginBottom: 16 }}>{error}</h2>
        <a href="/" style={{ color: "#4f46e5", fontSize: 15 }}>
          Run your own verification →
        </a>
      </div>
    );
  }

  if (!state) {
    return (
      <div style={{ textAlign: "center", padding: "60px", color: "#6b7280", fontFamily: "system-ui" }}>
        Loading report…
      </div>
    );
  }

  return (
    <div>
      <div style={{ minHeight: "100vh", padding: "2rem 1rem", background: "#f9fafb" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <a href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: "#6366f1", letterSpacing: -0.5 }}>
              VerifAI
            </span>
          </a>
        </div>
        <ReportView state={{ ...state, run_id: runId }} onReset={() => { window.location.href = "/verify"; }} />
        <div style={{ textAlign: "center", padding: "24px", color: "#9ca3af", fontSize: 13 }}>
          <a href="/" style={{ color: "#4f46e5" }}>
            Run your own verification with VerifAI →
          </a>
        </div>
      </div>
    </div>
  );
}
