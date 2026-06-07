import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function HistoryPage({ user }) {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);

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
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>All Verifications</h2>
        <a href="/verify" style={{ color: "#4f46e5", textDecoration: "none" }}>
          ← New Verification
        </a>
      </div>

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading…</p>
      ) : verifications.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No verifications yet.</p>
      ) : (
        verifications.map((v) => (
          <a
            key={v.id}
            href={`/report/${v.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "14px 0",
              borderBottom: "1px solid #f3f4f6",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span style={{ fontWeight: 500 }}>{v.github_username}</span>
            <span style={{ color: "#9ca3af", fontSize: 13 }}>
              {new Date(v.created_at).toLocaleDateString()} →
            </span>
          </a>
        ))
      )}
    </div>
  );
}
