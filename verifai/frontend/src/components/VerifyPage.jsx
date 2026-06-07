import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import ReportView from "./ReportView.jsx";
import StatusPoll from "./StatusPoll.jsx";
import UploadForm from "./UploadForm.jsx";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
  }, [user, phase]); // refetch when phase returns to form after a run

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>

      {/* Navbar */}
      <nav style={{
        background: "white",
        borderBottom: "1px solid #e5e7eb",
        padding: "12px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <a href="/" style={{ fontSize: 20, fontWeight: 700, color: "#4f46e5", textDecoration: "none" }}>
          VerifAI
        </a>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ color: "#6b7280", fontSize: 14 }}>{user.email}</span>
            <button
              onClick={handleSignOut}
              style={{
                padding: "6px 12px",
                background: "transparent",
                border: "1px solid #e5e7eb",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </nav>

      {/* Main content */}
      <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 24px" }}>

        {phase === "form" && (
          <>
            <UploadForm
              user={user}
              onStarted={(id) => { setRunId(id); setPhase("polling"); }}
            />

            {pastVerifications.length > 0 && (
              <div style={{
                marginTop: 32,
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 20,
              }}>
                <h3 style={{
                  margin: "0 0 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#374151",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  Recent Verifications
                </h3>

                {pastVerifications.slice(0, 5).map((v) => (
                  <a
                    key={v.id}
                    href={`/report/${v.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: "1px solid #f3f4f6",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span style={{ fontWeight: 500, color: "#111" }}>{v.github_username}</span>
                    <span style={{ color: "#9ca3af", fontSize: 13 }}>
                      {new Date(v.created_at).toLocaleDateString()} →
                    </span>
                  </a>
                ))}

                {pastVerifications.length > 5 && (
                  <a
                    href="/history"
                    style={{
                      display: "block",
                      marginTop: 12,
                      color: "#4f46e5",
                      fontSize: 13,
                      textDecoration: "none",
                    }}
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
