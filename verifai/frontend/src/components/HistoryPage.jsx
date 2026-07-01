import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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

export default function HistoryPage({ user }) {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  useEffect(() => {
    const fetchAll = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = "/login"; return; }
      const res = await fetch(`${API_BASE}/history`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVerifications(data.verifications || []);
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: FONT }}>
      <Navbar user={user} onSignOut={handleSignOut} />

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: PRIMARY, letterSpacing: "-0.03em" }}>
            All verifications
          </h1>
          <a href="/verify" style={{ color: PRIMARY, textDecoration: "none", fontSize: 14, fontWeight: 500 }}>
            ← New verification
          </a>
        </div>

        {loading ? (
          <p style={{ color: "#64748b" }}>Loading…</p>
        ) : verifications.length === 0 ? (
          <p style={{ color: "#64748b" }}>No verifications yet.</p>
        ) : (
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
            {verifications.map((v, i) => (
              <a
                key={v.id}
                href={`/report/${v.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderBottom: i < verifications.length - 1 ? `1px solid ${BORDER}` : "none",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#9ca3af" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <span style={{ fontWeight: 500, color: PRIMARY, fontSize: 14 }}>@{v.github_username}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#9ca3af", fontSize: 12 }}>
                    {new Date(v.created_at).toLocaleDateString()}
                  </span>
                  <span style={{ color: "#9ca3af" }}>›</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
