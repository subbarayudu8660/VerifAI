import { supabase } from "./lib/supabase";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export const startVerification = async (githubUsername, resumeText) => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify({ github_username: githubUsername, resume_text: resumeText }),
  });

  if (response.status === 401) {
    throw new Error("Please sign in to verify candidates.");
  }

  if (response.status === 429) {
    const data = await response.json();
    throw new Error(`${data.detail.message} ${data.detail.contact}`);
  }

  if (!response.ok) {
    throw new Error("Failed to start verification. Please try again.");
  }

  return response.json();
};

export const getResults = async (runId) => {
  const response = await fetch(`${API_BASE}/results/${runId}`);
  if (!response.ok) throw new Error("Failed to fetch results.");
  return response.json();
};

export const getUsage = async () => {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}/usage`, { headers });
  if (!response.ok) return { used: 0, remaining: 5, limit: 5 };
  return response.json();
};
