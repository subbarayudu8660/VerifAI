const BASE = "http://localhost:8000";

export async function startVerification(githubUsername, resumeText) {
  const res = await fetch(`${BASE}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ github_username: githubUsername, resume_text: resumeText || null }),
  });
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json(); // { run_id, status }
}

export async function getResults(runId) {
  const res = await fetch(`${BASE}/results/${runId}`);
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return res.json(); // PipelineState
}
