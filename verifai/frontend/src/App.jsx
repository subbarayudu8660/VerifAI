import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { supabase } from "./lib/supabase";
import LandingPage from "./LandingPage.jsx";
import Auth from "./components/Auth.jsx";
import HistoryPage from "./components/HistoryPage.jsx";
import ReportPage from "./components/ReportPage.jsx";
import VerifyPage from "./components/VerifyPage.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null),
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={user ? <Navigate to="/verify" replace /> : <Auth />} />
        <Route path="/verify" element={user ? <VerifyPage user={user} /> : <Navigate to="/login" replace />} />
        <Route path="/report/:runId" element={<ReportPage />} />
        <Route path="/history" element={user ? <HistoryPage user={user} /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
