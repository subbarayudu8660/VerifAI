import React from "react";
import { supabase } from "../lib/supabase";

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
      background: "#f9fafb",
    }}>
      <div style={{
        background: "white",
        padding: "48px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        textAlign: "center",
        maxWidth: 400,
        width: "100%",
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#4f46e5", marginBottom: 8 }}>
          VerifAI
        </h1>
        <p style={{ color: "#6b7280", marginBottom: 32 }}>
          Sign in to start verifying candidates
        </p>
        <button
          onClick={handleGoogleSignIn}
          style={{
            width: "100%",
            padding: "12px",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 15,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <img
            src="https://www.google.com/favicon.ico"
            width={18}
            height={18}
            alt="Google"
          />
          Continue with Google
        </button>
      </div>
    </div>
  );
}
