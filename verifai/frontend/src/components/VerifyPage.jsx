import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import ReportView from "./ReportView.jsx";
import StatusPoll from "./StatusPoll.jsx";
import UploadForm from "./UploadForm.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PRIMARY = "#0f172a";
const BORDER = "#e2e8f0";
const FONT = "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif";

function Navbar({ user, onSignOut }) {
  return (
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
      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#64748b", fontSize: 14 }}>{user.email}</span>
          <button
            onClick={onSignOut}
            style={{
              padding: "6px 12px",
              background: "transparent",
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              color: "#64748b",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}

export default function VerifyPage({ user }) {
  const [phase, setPhase] = useState("form"); // "form" | "polling" | "report"
  const [runId, setRunId] = useState(null);
  const [state, setState] = useState(null);
  const [pastVerifications, setPastVerifications] = useState([]);

  useEffect(() => {
    if (!user) return;
    const fetchHistory = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${API_BASE}/history`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPastVerifications(data.verifications || []);
      }
    };
    fetchHistory();
  }, [user, phase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: FONT }}>
      <Navbar user={user} onSignOut={handleSignOut} />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>

        {phase === "form" && (
          <>
            {/* Page header */}
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: PRIMARY, margin: "0 0 6px", letterSpacing: "-0.03em" }}>
                Verify a candidate
              </h1>
              <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>
                Submit a public GitHub handle and an optional resume. We'll return a structured report.
              </p>
            </div>

            <UploadForm
              user={user}
              onStarted={(id) => { setRunId(id); setPhase("polling"); }}
            />

            {pastVerifications.length > 0 && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: PRIMARY, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Past verifications
                  </span>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Last 30 days</span>
                </div>

                <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
                  {pastVerifications.slice(0, 5).map((v, i, arr) => (
                    <a
                      key={v.id}
                      href={`/report/${v.id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "13px 18px",
                        borderBottom: i < Math.min(arr.length, 5) - 1 ? `1px solid ${BORDER}` : "none",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#9ca3af" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                        <span style={{ fontWeight: 500, color: PRIMARY, fontSize: 14 }}>@{v.github_username}</span>
                        {v.one_liner && (
                          <span style={{ fontSize: 13, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
                            — {v.one_liner}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>
                          {new Date(v.created_at).toLocaleDateString()}
                        </span>
                        <span style={{ color: "#9ca3af", fontSize: 13 }}>›</span>
                      </div>
                    </a>
                  ))}
                </div>

                {pastVerifications.length > 5 && (
                  <a
                    href="/history"
                    style={{ display: "block", marginTop: 12, color: "#374151", fontSize: 13, textDecoration: "none" }}
                  >
                    See all {pastVerifications.length} verifications →
                  </a>
                )}
              </div>
            )}
          </>
        )}

        {phase === "polling" && (
          <StatusPoll
            runId={runId}
            onComplete={(s) => { setState(s); setPhase("report"); }}
          />
        )}

        {phase === "report" && (
          <ReportView
            state={state}
            onReset={() => { setState(null); setRunId(null); setPhase("form"); }}
          />
        )}
      </div>
    </div>
  );
}
