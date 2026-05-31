import React, { useCallback, useState } from "react";
import ReportView from "./components/ReportView.jsx";
import StatusPoll from "./components/StatusPoll.jsx";
import UploadForm from "./components/UploadForm.jsx";

const s = {
  wrapper: { minHeight: "100vh", padding: "2rem 1rem" },
  header: { textAlign: "center", marginBottom: "2rem" },
  logo: { fontSize: 28, fontWeight: 800, color: "#6366f1", letterSpacing: -1 },
  tagline: { color: "#6b7280", fontSize: 15, marginTop: 4 },
};

export default function App() {
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
    <div style={s.wrapper}>
      <div style={s.header}>
        <div style={s.logo}>VerifAI</div>
        <div style={s.tagline}>Automated technical candidate verification</div>
      </div>

      {phase === "form" && <UploadForm onStarted={handleStarted} />}
      {phase === "polling" && <StatusPoll runId={runId} onComplete={handleComplete} />}
      {phase === "done" && <ReportView state={result} onReset={handleReset} />}
    </div>
  );
}
