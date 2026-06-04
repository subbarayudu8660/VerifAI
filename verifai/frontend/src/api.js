const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const startVerification = async (githubUsername, resumeText) => {
  const response = await fetch(`${API_BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ github_username: githubUsername, resume_text: resumeText }),
  });

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
  const response = await fetch(`${API_BASE}/usage`);
  if (!response.ok) throw new Error("Failed to fetch usage.");
  return response.json();
};
