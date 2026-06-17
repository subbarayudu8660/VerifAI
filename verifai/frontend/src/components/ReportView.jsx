import React, { useState, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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

const card = {
  background: "#fff",
  borderRadius: 10,
  padding: "1.25rem 1.5rem",
  border: "1px solid #e5e7eb",
  marginBottom: 14,
};

const sectionTitle = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#9ca3af",
  marginBottom: 12,
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const th = {
  textAlign: "left",
  padding: "7px 10px",
  borderBottom: "2px solid #f3f4f6",
  color: "#9ca3af",
  fontWeight: 600,
  fontSize: 12,
};

const td = {
  padding: "9px 10px",
  borderBottom: "1px solid #f9fafb",
  verticalAlign: "top",
};

const inlineBadge = (color) => ({
  display: "inline-block",
  background: color + "18",
  color,
  borderRadius: 4,
  padding: "1px 7px",
  fontSize: 11,
  fontWeight: 600,
  marginLeft: 5,
});

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function CandidateHeader({ state, onReset, onDownloadPDF, generatingPDF, onShare, shareCopied }) {
  const gh = state.github_data || {};
  const totalCommits = (gh.repos || []).reduce((a, r) => a + r.total_commits, 0);
  const langCount = Object.keys(gh.languages_first_seen || {}).length;
  const year = gh.account_created_at ? new Date(gh.account_created_at).getFullYear() : null;

  const meta = [
    year && `GitHub since ${year}`,
    gh.total_public_repos != null && `${gh.total_public_repos} repos`,
    `${totalCommits.toLocaleString()} commits`,
    langCount > 0 && `${langCount} languages`,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{ ...card, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 4 }}>
            Candidate Intelligence Report
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
            {state.github_username}
          </div>
          <div style={{ fontSize: 14, color: "#6b7280", marginTop: 3 }}>{meta}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={onDownloadPDF}
            disabled={generatingPDF}
            style={{
              padding: "6px 14px",
              background: "white",
              color: "#4f46e5",
              border: "1px solid #4f46e5",
              borderRadius: 7,
              cursor: generatingPDF ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 5,
              opacity: generatingPDF ? 0.6 : 1,
            }}
          >
            {generatingPDF ? "Generating…" : "↓ Download PDF"}
          </button>
          {state.run_id && (
            <button
              onClick={onShare}
              style={{
                padding: "6px 14px",
                background: "white",
                color: shareCopied ? "#16a34a" : "#4f46e5",
                border: `1px solid ${shareCopied ? "#16a34a" : "#4f46e5"}`,
                borderRadius: 7,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {shareCopied ? "✓ Copied!" : "⎘ Share Report"}
            </button>
          )}
          <button
            onClick={onReset}
            style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 7, padding: "6px 14px", cursor: "pointer", fontSize: 13, color: "#6b7280" }}
          >
            ← New verification
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recruiter Brief
// ---------------------------------------------------------------------------

function RecruiterBriefSection({ brief }) {
  if (!brief) return null;

  return (
    <div style={{
      background: "white",
      border: "2px solid #4f46e5",
      borderRadius: 12,
      padding: 28,
      marginBottom: 32,
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 700,
        color: "#4f46e5",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: 16,
      }}>
        Quick Brief — 30 Second Read
      </div>

      <p style={{ fontSize: 17, fontWeight: 600, color: "#111", marginBottom: 20, lineHeight: 1.5 }}>
        {brief.one_liner}
      </p>

      {brief.strongest_work?.repo_name && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
            Strongest Work
          </div>
          <p style={{ fontSize: 14, color: "#4b5563", margin: 0, lineHeight: 1.6 }}>
            {brief.strongest_work.summary}
          </p>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
          Skills
        </div>
        <p style={{ fontSize: 14, color: "#4b5563", margin: 0, lineHeight: 1.6 }}>
          {brief.confirmed_skills_line}
        </p>
      </div>

      {brief.call_questions?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
            What to Ask on the Call
          </div>
          {brief.call_questions.map((q, i) => (
            <div key={i} style={{
              background: "#f9fafb",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 8,
            }}>
              <p style={{ fontSize: 14, color: "#111", margin: "0 0 4px", fontWeight: 500 }}>
                Ask: "{q.ask}"
              </p>
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                Listen for: {q.listen_for}
              </p>
            </div>
          ))}
        </div>
      )}

      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
          Profile Consistency
        </div>
        <p style={{ fontSize: 14, color: "#4b5563", margin: 0, lineHeight: 1.6 }}>
          {brief.profile_consistency}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ recruiter }) {
  if (!recruiter?.overview) return null;
  return (
    <div style={card}>
      <div style={sectionTitle}>Overview</div>
      <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, margin: 0 }}>
        {recruiter.overview}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Evidence
// ---------------------------------------------------------------------------

function SkillEvidence({ skills, hasResume }) {
  if (!hasResume) {
    return (
      <div style={card}>
        <div style={sectionTitle}>Skill Evidence</div>
        <p style={{ fontSize: 14, color: "#9ca3af", margin: 0 }}>Upload a resume to see skill verification.</p>
      </div>
    );
  }
  if (!skills?.length) return null;

  const supported = skills.filter((s) => s.evidence_found);
  const noEvidence = skills.filter((s) => !s.evidence_found);

  const pill = (label, bg, color) => (
    <span
      key={label}
      style={{
        display: "inline-block",
        background: bg,
        color,
        borderRadius: 20,
        padding: "3px 11px",
        fontSize: 12,
        fontWeight: 500,
        margin: "3px 4px 3px 0",
      }}
    >
      {label}
    </span>
  );

  return (
    <div style={card}>
      <div style={sectionTitle}>Skill Evidence</div>

      {supported.length > 0 && (
        <div style={{ marginBottom: noEvidence.length > 0 ? 14 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#16a34a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Supported
          </div>
          <div>
            {supported.map((s) => pill(s.skill, "#f0fdf4", "#15803d"))}
          </div>
        </div>
      )}

      {noEvidence.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            No public evidence — ask candidate to clarify
          </div>
          <div>
            {noEvidence.map((s) => pill(s.skill, "#f3f4f6", "#6b7280"))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Patterns
// ---------------------------------------------------------------------------

function ActivityPatterns({ recruiter }) {
  const ap = recruiter?.activity_patterns;
  if (!ap) return null;

  const stats = [
    { label: "Account age", value: ap.account_age },
    { label: "Most active in", value: (ap.most_active_languages || []).join(", ") || "—" },
    { label: "Repo velocity", value: ap.repo_velocity },
    { label: "Commit pattern", value: ap.commit_pattern },
  ];

  return (
    <div style={card}>
      <div style={sectionTitle}>Activity Patterns</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "#f9fafb", borderRadius: 7, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project Claims
// ---------------------------------------------------------------------------

const PROJECT_FLAG_DISPLAY = {
  CLAIM_NO_EVIDENCE:         { icon: "✗", color: "#dc2626", note: "No matching repo found" },
  LIKELY_PRIVATE_CORPORATE:  { icon: "⚠", color: "#d97706", note: "Corporate/private repo expected" },
  LIKELY_PRIVATE_CLASSIFIED: { icon: "🔒", color: "#6b7280", note: "Classified/private work expected" },
};

function ProjectMatches({ matches }) {
  if (!matches || matches.length === 0) return null;

  return (
    <div style={card}>
      <div style={sectionTitle}>Project Claims</div>
      {matches.map((m, i) => {
        const matched = m.matched_repo !== null;
        const fd = PROJECT_FLAG_DISPLAY[m.flag] || { icon: "✗", color: "#dc2626" };

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
                </>
              ) : (
                <span style={{ color: fd.color, marginLeft: 6 }}>
                  → {fd.note}
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

// ---------------------------------------------------------------------------
// Repo Reference
// ---------------------------------------------------------------------------

function RepoTable({ repos, username, reposCapped, totalReposFound }) {
  if (!repos?.length) return null;

  return (
    <div style={card}>
      <div style={sectionTitle}>Repo Reference</div>
      {reposCapped && (
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 0, marginBottom: 10 }}>
          Showing 30 most recent repos out of {totalReposFound} total
        </p>
      )}
      <table style={table}>
        <thead>
          <tr>
            <th style={th}>Repository</th>
            <th style={th}>Commits</th>
            <th style={th}>Languages</th>
            <th style={th}>Flags</th>
          </tr>
        </thead>
        <tbody>
          {repos.slice(0, 20).map((repo) => {
            const repoFlags = repo.flags.filter((f) => INLINE_FLAGS.includes(f.flag_type));
            return (
              <tr key={repo.repo_name}>
                <td style={td}>
                  <a
                    href={`https://github.com/${username}/${repo.repo_name}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontWeight: 600, color: "#1d4ed8", textDecoration: "none" }}
                  >
                    {repo.repo_name}
                  </a>
                  {repo.is_fork && <span style={inlineBadge("#92400e")}>fork</span>}
                </td>
                <td style={{ ...td, color: repo.total_commits === 0 ? "#ef4444" : "#374151" }}>
                  {repo.total_commits}
                </td>
                <td style={td}>
                  {Object.keys(repo.languages).slice(0, 3).join(", ") || "—"}
                </td>
                <td style={td}>
                  {repoFlags.map((f) => (
                    <span key={f.flag_type} title={f.evidence} style={inlineBadge(FLAG_COLORS[f.flag_type])}>
                      {FLAG_LABELS[f.flag_type]}
                    </span>
                  ))}
                </td>
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

// ---------------------------------------------------------------------------
// Interview Questions
// ---------------------------------------------------------------------------

function InterviewQuestions({ recruiter, hasResume }) {
  if (!hasResume || !recruiter) return null;

  const items = [];

  (recruiter.project_interview_questions || []).forEach((q) => {
    const context = q.matched_repo
      ? `Re: ${q.matched_repo}`
      : `Re: Unmatched project "${q.project}"`;
    items.push({ context, question: q.interview_question });
  });

  if (items.length === 0) return null;

  return (
    <div style={card}>
      <div style={sectionTitle}>Interview Questions</div>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 16,
            marginBottom: i < items.length - 1 ? 20 : 0,
          }}
        >
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#9ca3af",
            flexShrink: 0,
            minWidth: 20,
            paddingTop: 1,
          }}>
            {i + 1}.
          </div>
          <div>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: 5,
            }}>
              {item.context}
            </div>
            <div style={{ fontSize: 14, color: "#1f2937", lineHeight: 1.6 }}>
              "{item.question}"
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Debug
// ---------------------------------------------------------------------------

function DebugInfo({ errors, hidden }) {
  const [open, setOpen] = useState(false);
  if (!errors?.length || hidden) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <span
        onClick={() => setOpen((o) => !o)}
        style={{ fontSize: 13, color: "#9ca3af", cursor: "pointer", padding: "8px 0", display: "block" }}
      >
        {open ? "▾" : "▸"} Debug ({errors.length} pipeline error{errors.length !== 1 ? "s" : ""})
      </span>
      {open && (
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px", fontSize: 12, color: "#6b7280", marginTop: 8 }}>
          {errors.map((e, i) => <div key={i}>· {e}</div>)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

function FeedbackWidget({ githubUsername, runId, hidden }) {
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (hidden) return null;

  const handleSubmit = async () => {
    try {
      await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, github_username: githubUsername, run_id: runId }),
      });
    } catch (e) {
      // fail silently
    }
    setSubmitted(true);
  };

  return (
    <div style={{
      maxWidth: 680,
      margin: "32px auto",
      padding: 24,
      background: "#f9fafb",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      textAlign: "center",
    }}>
      {!submitted ? (
        <>
          <p style={{ margin: "0 0 16px", color: "#374151", fontWeight: 500 }}>
            Was this report useful?
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
            <button
              onClick={() => setRating("yes")}
              style={{
                padding: "8px 20px",
                border: `2px solid ${rating === "yes" ? "#16a34a" : "#e5e7eb"}`,
                background: rating === "yes" ? "#f0fdf4" : "white",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 18,
              }}
            >👍</button>
            <button
              onClick={() => setRating("no")}
              style={{
                padding: "8px 20px",
                border: `2px solid ${rating === "no" ? "#dc2626" : "#e5e7eb"}`,
                background: rating === "no" ? "#fef2f2" : "white",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 18,
              }}
            >👎</button>
          </div>
          {rating && (
            <>
              <textarea
                placeholder="Tell us why (optional)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  fontSize: 14,
                  resize: "vertical",
                  minHeight: 80,
                  marginBottom: 12,
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={handleSubmit}
                style={{
                  padding: "8px 24px",
                  background: "#4f46e5",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Submit
              </button>
            </>
          )}
        </>
      ) : (
        <p style={{ color: "#16a34a", margin: 0, fontWeight: 500 }}>
          Thanks for your feedback! 🙏
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function ReportView({ state, onReset }) {
  const { github_data, skill_verification, project_matches, final_report, errors, skipped } = state;
  const reportRef = useRef(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  console.log('ReportView state keys:', Object.keys(state));
  console.log('project_matches:', project_matches);

  const shareReport = () => {
    const runId = state.run_id || window.location.pathname.split("/").pop();
    const url = `${window.location.origin}/report/${runId}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const downloadPDF = async () => {
    setGeneratingPDF(true);
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "mm", "a4");

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`verifai-report-${state.github_username}.pdf`);
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (!final_report) {
    const notFoundError = (errors || []).find((e) => e.includes("not found"));
    return (
      <div style={{ maxWidth: 680, margin: "60px auto", textAlign: "center", fontFamily: "system-ui" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: "#111", marginBottom: 8 }}>Verification Failed</h2>
        <p style={{ color: "#666", marginBottom: 24 }}>
          {notFoundError
            ? "GitHub username not found. Please check the username and try again."
            : "Something went wrong. Please try again."}
        </p>
        {(errors || []).map((err, i) => (
          <p key={i} style={{ color: "#dc2626", fontSize: 13 }}>{err}</p>
        ))}
        <button
          onClick={onReset}
          style={{ marginTop: 16, padding: "10px 24px", background: "#4f46e5", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Try Again
        </button>
      </div>
    );
  }

  const recruiter = final_report?.recruiter;
  const recruiterBrief = final_report?.recruiter_brief;
  const hasResume = Boolean(state.resume_raw || state.resume_claims);

  return (
    <div ref={reportRef} style={{ maxWidth: 820, margin: "0 auto", scrollBehavior: "smooth", overflowAnchor: "none" }}>
      <CandidateHeader state={state} onReset={onReset} onDownloadPDF={downloadPDF} generatingPDF={generatingPDF} onShare={shareReport} shareCopied={shareCopied} />
      <RecruiterBriefSection brief={recruiterBrief} />
      {recruiterBrief && (
        <div style={{ textAlign: "center", margin: "32px 0", position: "relative" }}>
          <div style={{ borderTop: "1px solid #e5e7eb" }}></div>
          <span style={{
            position: "relative",
            top: -12,
            background: "#f9fafb",
            padding: "0 16px",
            fontSize: 12,
            color: "#9ca3af",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            Full Technical Evidence Below
          </span>
        </div>
      )}
      <Overview recruiter={recruiter} />
      <SkillEvidence skills={skill_verification} hasResume={hasResume} />
      <ProjectMatches matches={project_matches} />
      <ActivityPatterns recruiter={recruiter} />
      <InterviewQuestions recruiter={recruiter} hasResume={hasResume} />
      <RepoTable repos={github_data?.repos} username={state.github_username} reposCapped={github_data?.repos_capped} totalReposFound={github_data?.total_repos_found} />
      <DebugInfo errors={errors} hidden={generatingPDF} />
      <FeedbackWidget githubUsername={state.github_username} runId={state.run_id || state.id} hidden={generatingPDF} />
    </div>
  );
}
