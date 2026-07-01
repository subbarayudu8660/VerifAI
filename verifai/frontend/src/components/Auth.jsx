import React from "react";
import { supabase } from "../lib/supabase";

const PRIMARY = "#0f172a";
const BORDER = "#e2e8f0";

export default function Auth() {
  const handleGoogleSignIn = async () => {
    const redirectTo = (import.meta.env.VITE_APP_URL || window.location.origin) + "/verify";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#f8fafc",
      fontFamily: "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: "white",
        padding: "48px",
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        textAlign: "center",
        maxWidth: 400,
        width: "100%",
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: PRIMARY, marginBottom: 8, letterSpacing: "-0.03em" }}>
          VerifAI
        </h1>
        <p style={{ color: "#64748b", marginBottom: 32, fontSize: 14 }}>
          Sign in to start verifying candidates
        </p>
        <button
          onClick={handleGoogleSignIn}
          style={{
            width: "100%",
            padding: "12px",
            background: "white",
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            color: PRIMARY,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <img src="https://www.google.com/favicon.ico" width={16} height={16} alt="Google" />
          Continue with Google
        </button>
      </div>
    </div>
  );
}
