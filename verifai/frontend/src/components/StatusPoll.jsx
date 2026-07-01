import React, { useEffect, useRef, useState } from "react";
import { getResults } from "../api.js";

const PRIMARY = "#0f172a";
const GREEN = "#16a34a";
const BORDER = "#e2e8f0";

const AGENT_LABELS = {
  queued: "Starting…",
  resume_parser: "Parsing resume…",
  github_scraper: "Scraping GitHub…",
  parallel_agents: "Analyzing code & verifying claims…",
  report_generator: "Generating report…",
  complete: "Complete",
};

const STEPS = ["resume_parser", "github_scraper", "parallel_agents", "report_generator"];

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
    <div style={{
      background: "#fff",
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: "32px",
      maxWidth: 540,
      margin: "0 auto",
      fontFamily: "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif",
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700, color: PRIMARY, letterSpacing: "-0.02em" }}>
        Running pipeline
        <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: 8 }}>
          · {AGENT_LABELS[agent] || agent}
        </span>
      </h2>

      {STEPS.map((step) => {
        const active = agent === step;
        const done = isDone(agent, step);
        return (
          <div
            key={step}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              borderBottom: `1px solid ${BORDER}`,
              opacity: done || active ? 1 : 0.35,
            }}
          >
            <div style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              flexShrink: 0,
              background: done ? GREEN : active ? PRIMARY : "#e2e8f0",
              boxShadow: active ? `0 0 0 3px #cbd5e1` : "none",
              transition: "all 0.3s",
            }} />
            <span style={{
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              color: active ? PRIMARY : "#374151",
            }}>
              {AGENT_LABELS[step]}
            </span>
            {active && (
              <div style={{
                width: 12,
                height: 12,
                border: "2px solid #cbd5e1",
                borderTop: `2px solid ${PRIMARY}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                marginLeft: "auto",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
