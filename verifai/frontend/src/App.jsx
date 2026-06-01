import React, { useCallback, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./LandingPage.jsx";
import ReportView from "./components/ReportView.jsx";
import StatusPoll from "./components/StatusPoll.jsx";
import UploadForm from "./components/UploadForm.jsx";

function VerifyPage() {
  const [phase, setPhase] = useState("form"); // "form" | "polling" | "done"
  const [runId, setRunId] = useState(null);
  const [result, setResult] = useState(null);

  const handleStarted = useCallback((id) => {
    setRunId(id);
    setPhase("polling");
  }, []);

  const handleComplete = useCallback((state) => {
    setResult(state);
    setPhase("done");
  }, []);

  const handleReset = useCallback(() => {
    setPhase("form");
    setRunId(null);
    setResult(null);
  }, []);

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1rem", background: "#f9fafb" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: "#6366f1", letterSpacing: -0.5 }}>
            VerifAI
          </span>
        </a>
      </div>
      {phase === "form" && <UploadForm onStarted={handleStarted} />}
      {phase === "polling" && <StatusPoll runId={runId} onComplete={handleComplete} />}
      {phase === "done" && <ReportView state={result} onReset={handleReset} />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
