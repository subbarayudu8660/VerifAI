import React, { useEffect, useRef, useState } from "react";
import { getResults } from "../api.js";

const AGENT_LABELS = {
  queued: "Starting…",
  resume_parser: "Parsing resume…",
  github_scraper: "Scraping GitHub…",
  ai_code_detector: "Analyzing code patterns…",
  coherence_verifier: "Verifying resume claims…",
  report_generator: "Generating report…",
  complete: "Complete",
};

const STEPS = ["resume_parser", "github_scraper", "ai_code_detector", "coherence_verifier", "report_generator"];

const s = {
  card: { background: "#fff", borderRadius: 12, padding: "2rem", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", maxWidth: 540, margin: "0 auto" },
  step: (active, done) => ({
    display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
    borderBottom: "1px solid #f3f4f6", opacity: done || active ? 1 : 0.35,
  }),
  dot: (active, done) => ({
    width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
    background: done ? "#22c55e" : active ? "#6366f1" : "#e5e7eb",
    boxShadow: active ? "0 0 0 4px #c7d2fe" : "none",
    transition: "all 0.3s",
  }),
  label: (active) => ({ fontSize: 14, fontWeight: active ? 600 : 400, color: active ? "#6366f1" : "#374151" }),
  spinner: { width: 14, height: 14, border: "2px solid #c7d2fe", borderTop: "2px solid #6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
};

function isDone(current, step) {
  const ci = STEPS.indexOf(current);
  const si = STEPS.indexOf(step);
  return ci > si || current === "complete";
}

export default function StatusPoll({ runId, onComplete }) {
  const [agent, setAgent] = useState("queued");
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const state = await getResults(runId);
        setAgent(state.current_agent || "queued");
        const done = state.final_report !== null || state.current_agent === "complete";
        if (done) {
          clearInterval(intervalRef.current);
          onComplete(state);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(intervalRef.current);
  }, [runId, onComplete]);

  return (
    <div style={s.card}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <h2 style={{ marginBottom: "1.5rem", fontSize: 20 }}>
        Running pipeline <span style={{ color: "#6366f1" }}>·</span> {AGENT_LABELS[agent] || agent}
      </h2>
      {STEPS.map((step) => {
        const active = agent === step;
        const done = isDone(agent, step);
        return (
          <div key={step} style={s.step(active, done)}>
            <div style={s.dot(active, done)} />
            <span style={s.label(active)}>{AGENT_LABELS[step]}</span>
            {active && <div style={s.spinner} />}
          </div>
        );
      })}
    </div>
  );
}
