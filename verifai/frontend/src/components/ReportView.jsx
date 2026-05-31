import React, { useState } from "react";

const FLAG_COLORS = {
  RECENT_CREATION: "#f97316",
  NO_COMMIT_HISTORY: "#ef4444",
  FORK_NO_CONTRIBUTION: "#f59e0b",
};

const FLAG_LABELS = {
  RECENT_CREATION: "Recently created",
  NO_COMMIT_HISTORY: "No commit history",
  FORK_NO_CONTRIBUTION: "Fork",
};

const INLINE_FLAGS = Object.keys(FLAG_COLORS);

function trustScore(state) {
  if (state.coherence_report) {
    return Math.round(state.coherence_report.overall_score * 100);
  }
  // Fallback: deduct from flags when no resume was provided
  const flags = (state.github_data?.repos || []).flatMap((r) => r.flags);
  const deductions = flags.reduce((acc, f) => {
    if (f.flag_type === "RECENT_CREATION") return acc - 10;
    if (f.flag_type === "NO_COMMIT_HISTORY") return acc - 4;
    if (f.flag_type === "FORK_NO_CONTRIBUTION") return acc - 6;
    return acc;
  }, 85);
  return Math.max(20, Math.min(100, deductions));
}

function scoreColor(score) {
  if (score >= 75) return "#16a34a";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function riskLabel(score) {
  if (score >= 75) return { text: "LOW RISK", color: "#16a34a", bg: "#f0fdf4" };
  if (score >= 50) return { text: "MEDIUM RISK", color: "#d97706", bg: "#fffbeb" };
  return { text: "HIGH RISK", color: "#dc2626", bg: "#fef2f2" };
}

const s = {
  page: { maxWidth: 820, margin: "0 auto" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  resetBtn: { background: "none", border: "1.5px solid #e5e7eb", borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontSize: 14, color: "#374151" },
  card: { background: "#fff", borderRadius: 12, padding: "1.5rem", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 16 },
  scoreRow: { display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" },
  scoreNum: (score) => ({ fontSize: 52, fontWeight: 800, color: scoreColor(score), lineHeight: 1 }),
  scoreLabel: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  riskBadge: (score) => {
    const r = riskLabel(score);
    return { background: r.bg, color: r.color, borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 13 };
  },
  statsRow: { display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12 },
  stat: { fontSize: 14, color: "#4b5563" },
  statNum: { fontWeight: 700, color: "#111827" },
  sectionTitle: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", marginBottom: 14 },
  flagRow: { borderLeft: "3px solid #ef4444", paddingLeft: 14, marginBottom: 16 },
  flagMain: { fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 4 },
  flagSub: { fontSize: 13, color: "#6b7280", marginBottom: 6 },
  question: { fontSize: 13, background: "#f0f4ff", borderRadius: 6, padding: "7px 12px", color: "#4338ca", fontStyle: "italic" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #f3f4f6", color: "#6b7280", fontWeight: 600, fontSize: 12 },
  td: { padding: "9px 10px", borderBottom: "1px solid #f9fafb", verticalAlign: "top" },
  inlineBadge: (color) => ({ display: "inline-block", background: color + "18", color, borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 600, marginLeft: 5 }),
  qNum: { color: "#6366f1", fontWeight: 700, marginRight: 6, fontSize: 15 },
  qText: { fontSize: 14, color: "#1f2937", lineHeight: 1.5 },
  debugToggle: { fontSize: 13, color: "#9ca3af", cursor: "pointer", padding: "8px 0", display: "block" },
  debugContent: { background: "#f9fafb", borderRadius: 8, padding: "12px", fontSize: 12, color: "#6b7280", marginTop: 8 },
  bar: (pct) => ({
    display: "inline-block", width: 80, height: 8, borderRadius: 4,
    background: `linear-gradient(to right, ${pct >= 75 ? "#16a34a" : pct >= 40 ? "#d97706" : "#dc2626"} ${pct}%, #e5e7eb ${pct}%)`,
    verticalAlign: "middle", marginRight: 6,
  }),
};

function ScoreHeader({ state }) {
  const score = trustScore(state);
  const risk = riskLabel(score);
  const gh = state.github_data || {};
  const totalCommits = (gh.repos || []).reduce((a, r) => a + r.total_commits, 0);
  const langCount = Object.keys(gh.languages_first_seen || {}).length;

  return (
    <div style={s.card}>
      <div style={s.scoreRow}>
        <div>
          <div style={s.scoreNum(score)}>{score}<span style={{ fontSize: 22, fontWeight: 400, color: "#9ca3af" }}>/100</span></div>
          <div style={s.scoreLabel}>Trust Score</div>
        </div>
        <div style={s.riskBadge(score)}>{risk.text}</div>
        {state.coherence_report && (
          <div style={{ fontSize: 13, color: "#6b7280", maxWidth: 340 }}>
            {state.coherence_report.summary}
          </div>
        )}
      </div>
      <div style={s.statsRow}>
        <div style={s.stat}><span style={s.statNum}>{gh.total_public_repos || 0}</span> repos</div>
        <div style={s.stat}><span style={s.statNum}>{totalCommits.toLocaleString()}</span> commits</div>
        <div style={s.stat}><span style={s.statNum}>{langCount}</span> languages</div>
        {gh.account_created_at && (
          <div style={s.stat}>on GitHub since <span style={s.statNum}>{new Date(gh.account_created_at).getFullYear()}</span></div>
        )}
      </div>
    </div>
  );
}

function RedFlags({ coherence, hasResume }) {
  if (!hasResume) {
    return (
      <div style={s.card}>
        <div style={s.sectionTitle}>⚠ Red Flags</div>
        <p style={{ fontSize: 14, color: "#9ca3af" }}>Upload a resume to see claim verification.</p>
      </div>
    );
  }
  if (!coherence) return null;

  const contradictions = coherence.checks.filter((c) => c.verdict === "contradicted");
  if (contradictions.length === 0) {
    return (
      <div style={s.card}>
        <div style={s.sectionTitle}>⚠ Red Flags</div>
        <p style={{ fontSize: 14, color: "#16a34a" }}>No contradictions found between resume claims and GitHub activity.</p>
      </div>
    );
  }

  return (
    <div style={s.card}>
      <div style={s.sectionTitle}>⚠ Red Flags — {contradictions.length} claim{contradictions.length !== 1 ? "s" : ""} contradicted</div>
      {contradictions.map((check, i) => (
        <div key={i} style={s.flagRow}>
          <div style={s.flagMain}>{check.claim}</div>
          {check.contradicting_evidence.map((e, j) => (
            <div key={j} style={s.flagSub}>· {e}</div>
          ))}
          {coherence.interview_questions[i] && (
            <div style={s.question}>
              → Ask: "{coherence.interview_questions[i]}"
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SkillTable({ skills, hasResume }) {
  if (!hasResume) {
    return (
      <div style={s.card}>
        <div style={s.sectionTitle}>Skill Verification</div>
        <p style={{ fontSize: 14, color: "#9ca3af" }}>Upload a resume to see skill verification.</p>
      </div>
    );
  }
  if (!skills || skills.length === 0) return null;

  return (
    <div style={s.card}>
      <div style={s.sectionTitle}>Skill Verification</div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Skill</th>
            <th style={s.th}>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {skills.map((sk) => (
            <tr key={sk.skill}>
              <td style={{ ...s.td, fontWeight: 600 }}>{sk.skill}</td>
              <td style={s.td}>
                {sk.evidence_found ? (
                  <span style={{ color: "#374151" }}>
                    {sk.evidence_repos.length} repo{sk.evidence_repos.length !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span style={{ color: "#dc2626", fontStyle: "italic" }}>No evidence found</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PROJECT_FLAG_DISPLAY = {
  CLAIM_NO_EVIDENCE:         { icon: "✗", color: "#dc2626", note: null },
  LIKELY_PRIVATE_CORPORATE:  { icon: "⚠", color: "#d97706", note: "Corporate/private repo expected" },
  LIKELY_PRIVATE_CLASSIFIED: { icon: "🔒", color: "#6b7280", note: "Classified/private work — verify directly" },
};

function ProjectMatches({ matches, hasResume }) {
  if (!hasResume) return null;
  if (!matches || matches.length === 0) return null;

  return (
    <div style={s.card}>
      <div style={s.sectionTitle}>Project Claims</div>
      {matches.map((m, i) => {
        const matched = m.matched_repo !== null;
        const fd = PROJECT_FLAG_DISPLAY[m.flag] || { icon: "✗", color: "#dc2626", note: null };

        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, fontSize: 14 }}>
            <span style={{ fontSize: 16, flexShrink: 0, color: matched ? "#16a34a" : fd.color }}>
              {matched ? "✓" : fd.icon}
            </span>
            <div>
              <span style={{ color: "#374151" }}>"{m.claimed_project}"</span>
              {matched ? (
                <>
                  <span style={{ color: "#9ca3af", margin: "0 6px" }}>→</span>
                  <a
                    href={`https://github.com/${m.github_username}/${m.matched_repo}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#6366f1", fontWeight: 600, textDecoration: "none" }}
                  >
                    {m.matched_repo}
                  </a>
                  <span style={{ color: "#9ca3af", marginLeft: 6, fontSize: 13 }}>
                    ({Math.round(m.match_confidence * 100)}%)
                  </span>
                </>
              ) : (
                <span style={{ color: fd.color, marginLeft: 6 }}>
                  → {fd.note || "No matching repo found"}
                </span>
              )}
              {m.note && !matched && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 3 }}>{m.note}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RepoTable({ repos }) {
  if (!repos || repos.length === 0) return null;
  return (
    <div style={s.card}>
      <div style={s.sectionTitle}>GitHub Summary</div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Repository</th>
            <th style={s.th}>Commits</th>
            <th style={s.th}>Languages</th>
            <th style={s.th}>Issues</th>
          </tr>
        </thead>
        <tbody>
          {repos.slice(0, 20).map((repo) => {
            const inlineFlags = repo.flags.filter((f) => INLINE_FLAGS.includes(f.flag_type));
            return (
              <tr key={repo.repo_name}>
                <td style={s.td}>
                  <span style={{ fontWeight: 600 }}>{repo.repo_name}</span>
                  {repo.is_fork && <span style={s.inlineBadge("#92400e")}>fork</span>}
                  {inlineFlags.map((f) => (
                    <span key={f.flag_type} title={f.evidence} style={s.inlineBadge(FLAG_COLORS[f.flag_type])}>
                      {FLAG_LABELS[f.flag_type]}
                    </span>
                  ))}
                </td>
                <td style={{ ...s.td, color: repo.total_commits === 0 ? "#ef4444" : "#374151" }}>
                  {repo.total_commits}
                </td>
                <td style={s.td}>
                  {Object.keys(repo.languages).slice(0, 3).join(", ") || "—"}
                </td>
                <td style={{ ...s.td, color: "#6b7280" }}>{repo.open_issues_count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {repos.length > 20 && (
        <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 10 }}>+ {repos.length - 20} more repos</p>
      )}
    </div>
  );
}

function InterviewQuestions({ coherence }) {
  if (!coherence || !coherence.interview_questions || coherence.interview_questions.length === 0) return null;
  return (
    <div style={s.card}>
      <div style={s.sectionTitle}>Suggested Interview Questions</div>
      {coherence.interview_questions.map((q, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: 12 }}>
          <span style={s.qNum}>{i + 1}.</span>
          <span style={s.qText}>{q}</span>
        </div>
      ))}
    </div>
  );
}

function DebugInfo({ errors }) {
  const [open, setOpen] = useState(false);
  if (!errors || errors.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={s.debugToggle} onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Debug info ({errors.length} pipeline error{errors.length !== 1 ? "s" : ""})
      </span>
      {open && (
        <div style={s.debugContent}>
          {errors.map((e, i) => <div key={i}>· {e}</div>)}
        </div>
      )}
    </div>
  );
}

export default function ReportView({ state, onReset }) {
  const { github_data, coherence_report, skill_verification, project_matches, errors } = state;
  const hasResume = Boolean(state.resume_raw || state.resume_claims);

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>
          {state.github_username}
          <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 15, marginLeft: 8 }}>verification report</span>
        </h1>
        <button style={s.resetBtn} onClick={onReset}>← New verification</button>
      </div>

      <ScoreHeader state={state} />
      <RedFlags coherence={coherence_report} hasResume={hasResume} />
      <SkillTable skills={skill_verification} hasResume={hasResume} />
      <ProjectMatches matches={project_matches} hasResume={hasResume} />
      <RepoTable repos={github_data?.repos} />
      <InterviewQuestions coherence={coherence_report} />
      <DebugInfo errors={errors} />
    </div>
  );
}
