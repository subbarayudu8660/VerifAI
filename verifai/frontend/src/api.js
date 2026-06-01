const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const startVerification = async (githubUsername, resumeText) => {
  const response = await fetch(`${API_BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ github_username: githubUsername, resume_text: resumeText }),
  });
  return response.json();
};

export const getResults = async (runId) => {
  const response = await fetch(`${API_BASE}/results/${runId}`);
  return response.json();
};
