import React, { useState, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PRIMARY = "#0f172a";
const GREEN = "#16a34a";
const BORDER = "#e2e8f0";
const BG = "#f8fafc";
const AMBER = "#d97706";
const FONT = "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif";

// ---------------------------------------------------------------------------
// Flag config
// ---------------------------------------------------------------------------

const FLAG_COLORS = {
  RECENT_CREATION: AMBER,
  NO_COMMIT_HISTORY: "#ef4444",
  FORK_NO_CONTRIBUTION: AMBER,
  EMPTY_OR_MINIMAL_REPO: "#9ca3af",
};

const FLAG_LABELS = {
  RECENT_CREATION: "Recently created",
  NO_COMMIT_HISTORY: "No commit history",
  FORK_NO_CONTRIBUTION: "Fork",
  EMPTY_OR_MINIMAL_REPO: "Minimal/empty",
};

const INLINE_FLAGS = Object.keys(FLAG_COLORS);

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

const card = {
  background: "#fff",
  borderRadius: 8,
  padding: "22px 24px",
  border: `1px solid ${BORDER}`,
  marginBottom: 12,
};

function SectionNum({ n }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: "#d1d5db", letterSpacing: "0.06em", marginBottom: 4 }}>
      {n}
    </div>
  );
}

const sectionLabel = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "#9ca3af",
  marginBottom: 14,
};

const table = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th = { textAlign: "left", padding: "7px 10px", borderBottom: `2px solid ${BORDER}`, color: "#9ca3af", fontWeight: 600, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" };
const td = { padding: "9px 10px", borderBottom: `1px solid ${BORDER}`, verticalAlign: "top" };

function FlagBadge({ flagType, evidence }) {
  const color = FLAG_COLORS[flagType] || "#9ca3af";
  return (
    <span
      title={evidence}
      style={{
        display: "inline-block",
        border: `1px solid ${color}`,
        color: color,
        background: color + "18",
        borderRadius: 4,
        padding: "1px 7px",
        fontSize: 11,
        fontWeight: 500,
        marginRight: 4,
      }}
    >
      {FLAG_LABELS[flagType] || flagType}
    </span>
  );
}

function OutlineButton({ children, onClick, disabled, color, style }) {
  const c = color || PRIMARY;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 14px",
        background: "#fff",
        color: c,
        border: `1px solid ${disabled ? BORDER : c}`,
        borderRadius: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13,
        fontWeight: 500,
        opacity: disabled ? 0.6 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Top bar (replaces CandidateHeader card)
// ---------------------------------------------------------------------------

function ReportTopBar({ state, onReset, onDownloadPDF, generatingPDF, onShare, shareCopied }) {
  const gh = state.github_data || {};
  const totalCommits = (gh.repos || []).reduce((a, r) => a + r.total_commits, 0);
  const repoCount = (gh.repos || []).length;

  return (
    <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
      <button
        onClick={onReset}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, color: "#9ca3af", marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: FONT }}
      >
        ← Back to verifications
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: PRIMARY, margin: "0 0 4px", letterSpacing: "-0.03em" }}>
            @{state.github_username}
          </h1>
          <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
            {repoCount > 0 && `${repoCount} repos analyzed · `}{totalCommits.toLocaleString()} commits
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <OutlineButton onClick={onDownloadPDF} disabled={generatingPDF}>
            {generatingPDF ? "Generating…" : "↓ Download PDF"}
          </OutlineButton>
          {state.run_id && (
            <OutlineButton onClick={onShare} color={shareCopied ? GREEN : PRIMARY}>
              {shareCopied ? "✓ Copied!" : "⎘ Share Report"}
            </OutlineButton>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Brief card
// ---------------------------------------------------------------------------

function RecruiterBriefSection({ brief, skills, githubData }) {
  if (!brief) return null;

  const confirmed = (skills || []).filter((s) => s.evidence_found);
  const unconfirmed = (skills || []).filter((s) => !s.evidence_found);
  const hasChips = confirmed.length > 0 || unconfirmed.length > 0;

  const totalCommits = ((githubData?.repos) || []).reduce((a, r) => a + r.total_commits, 0);
  const repoCount = (githubData?.repos || []).length;

  // Split profile_consistency into bullet sentences
  const bullets = brief.profile_consistency
    ? brief.profile_consistency
        .split(/\.\s+/)
        .map((s) => s.replace(/\.$/, "").trim())
        .filter(Boolean)
    : [];

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${BORDER}`,
      borderLeft: "3px solid #475569",
      borderRadius: 8,
      padding: "24px 28px",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Quick Brief
        </span>
      </div>

      <p style={{ fontSize: 18, fontWeight: 700, color: PRIMARY, margin: "0 0 22px", lineHeight: 1.4 }}>
        {brief.one_liner}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 24, marginBottom: 18 }}>
        {/* Strongest Work */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Strongest Work
          </div>
          {brief.strongest_work?.repo_name ? (
            <>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: PRIMARY, fontWeight: 600, marginBottom: 4 }}>
                {brief.strongest_work.repo_name}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.55 }}>
                {brief.strongest_work.summary}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>
          )}
        </div>

        {/* Skills */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Skills
          </div>
          {hasChips ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {confirmed.map((s) => (
                <span key={s.skill} style={{ border: `1px solid ${GREEN}`, color: GREEN, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>
                  {s.skill}
                </span>
              ))}
              {unconfirmed.map((s) => (
                <span key={s.skill} style={{ border: "1px solid #d1d5db", color: "#9ca3af", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>
                  {s.skill}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#64748b" }}>{brief.confirmed_skills_line}</div>
          )}
        </div>

        {/* Profile Consistency */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Profile Consistency
          </div>
          {bullets.length > 1 ? (
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.65 }}>
              {bullets.map((b, i) => <div key={i}>• {b}</div>)}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.65 }}>
              {brief.profile_consistency}
            </div>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Full Technical Evidence Below
        </span>
        {repoCount > 0 && (
          <span style={{ fontSize: 11, color: "#9ca3af" }}>
            {repoCount} repos analyzed · {totalCommits.toLocaleString()} commits
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 01 Overview
// ---------------------------------------------------------------------------

function Overview({ recruiter }) {
  if (!recruiter?.overview) return null;
  return (
    <div style={card}>
      <SectionNum n="01" />
      <div style={sectionLabel}>Overview</div>
      <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.75, margin: 0 }}>
        {recruiter.overview}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 02 Skill Evidence
// ---------------------------------------------------------------------------

function SkillEvidence({ skills, hasResume }) {
  if (!hasResume) {
    return (
      <div style={card}>
        <SectionNum n="02" />
        <div style={sectionLabel}>Skill Evidence</div>
        <p style={{ fontSize: 14, color: "#9ca3af", margin: 0 }}>Upload a resume to see skill verification.</p>
      </div>
    );
  }
  if (!skills?.length) return null;

  const confirmed = skills.filter((s) => s.evidence_found);
  const noEvidence = skills.filter((s) => !s.evidence_found);

  return (
    <div style={card}>
      <SectionNum n="02" />
      <div style={sectionLabel}>Skill Evidence</div>

      {confirmed.length > 0 && (
        <div style={{ marginBottom: noEvidence.length > 0 ? 16 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: GREEN, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Confirmed
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {confirmed.map((s) => (
              <span key={s.skill} style={{ border: `1px solid ${GREEN}`, color: GREEN, borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 500 }}>
                {s.skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {noEvidence.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
            Unconfirmed — ask candidate to clarify
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {noEvidence.map((s) => (
              <span key={s.skill} style={{ border: "1px solid #d1d5db", color: "#9ca3af", borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 500 }}>
                {s.skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 03 Project Claims
// ---------------------------------------------------------------------------

const PROJECT_FLAG_DISPLAY = {
  CLAIM_NO_EVIDENCE:         { icon: "✗", color: "#dc2626", note: "No matching repo found" },
  LIKELY_PRIVATE_CORPORATE:  { icon: "⚠", color: AMBER,     note: "Corporate/private repo expected" },
  LIKELY_PRIVATE_CLASSIFIED: { icon: "🔒", color: "#64748b", note: "Classified/private work expected" },
};

function ProjectMatches({ matches }) {
  if (!matches || matches.length === 0) return null;

  return (
    <div style={card}>
      <SectionNum n="03" />
      <div style={sectionLabel}>Project Claims</div>
      {matches.map((m, i) => {
        const matched = m.matched_repo !== null;
        const fd = PROJECT_FLAG_DISPLAY[m.flag] || { icon: "✗", color: "#dc2626" };
        const iconColor = matched ? GREEN : fd.color;

        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < matches.length - 1 ? 14 : 0, fontSize: 14 }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: iconColor + "20",
              color: iconColor,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
              marginTop: 1,
            }}>
              {matched ? "✓" : fd.icon === "🔒" ? "🔒" : fd.icon}
            </span>
            <div>
              <span style={{ color: PRIMARY, fontWeight: 600 }}>{m.claimed_project}</span>
              {matched ? (
                <>
                  <span style={{ color: "#9ca3af", margin: "0 6px" }}>→</span>
                  <a
                    href={`https://github.com/${m.github_username}/${m.matched_repo}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#374151", fontWeight: 500, textDecoration: "underline", textDecorationColor: BORDER }}
                  >
                    {m.matched_repo}
                  </a>
                </>
              ) : (
                <span style={{ color: "#9ca3af", marginLeft: 6, fontSize: 13 }}>
                  → {m.note || fd.note}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 04 Activity Patterns
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
      <SectionNum n="04" />
      <div style={sectionLabel}>Activity Patterns</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: BG, borderRadius: 6, padding: "14px 16px", border: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: PRIMARY, marginBottom: 4, lineHeight: 1.3 }}>
              {s.value}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 05 Interview Questions
// ---------------------------------------------------------------------------

function InterviewQuestions({ recruiter, hasResume }) {
  if (!hasResume || !recruiter) return null;

  const items = (recruiter.project_interview_questions || []).map((q) => ({
    context: q.matched_repo
      ? `Re: ${q.matched_repo}`
      : `Re: Unmatched project "${q.project}"`,
    question: q.interview_question,
  }));

  if (items.length === 0) return null;

  return (
    <div style={card}>
      <SectionNum n="05" />
      <div style={sectionLabel}>Interview Questions</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 16, marginBottom: i < items.length - 1 ? 22 : 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#d1d5db", flexShrink: 0, minWidth: 22, paddingTop: 1 }}>
            {i + 1}.
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>
              {item.context.toUpperCase()}
            </div>
            <div style={{ fontSize: 14, color: PRIMARY, lineHeight: 1.65 }}>
              "{item.question}"
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 06 Repository Reference
// ---------------------------------------------------------------------------

function RepoTable({ repos, username, reposCapped, totalReposFound }) {
  if (!repos?.length) return null;

  return (
    <div style={card}>
      <SectionNum n="06" />
      <div style={sectionLabel}>Repository Reference</div>
      {reposCapped && (
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 0, marginBottom: 12 }}>
          Showing 30 most recent repos out of {totalReposFound} total
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Repo</th>
              <th style={th}>Role</th>
              <th style={th}>Commits</th>
              <th style={th}>README</th>
              <th style={th}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {repos.slice(0, 20).map((repo) => {
              const repoFlags = repo.flags.filter((f) => INLINE_FLAGS.includes(f.flag_type));
              const role = repo.is_fork ? "Fork" : "Owner";
              return (
                <tr key={repo.repo_name}>
                  <td style={td}>
                    <a
                      href={`https://github.com/${username}/${repo.repo_name}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: PRIMARY, textDecoration: "none" }}
                    >
                      {repo.repo_name}
                    </a>
                  </td>
                  <td style={{ ...td, fontSize: 12, color: repo.is_fork ? "#9ca3af" : "#374151" }}>
                    {role}
                  </td>
                  <td style={{ ...td, color: repo.total_commits === 0 ? "#ef4444" : "#374151" }}>
                    {repo.total_commits}
                  </td>
                  <td style={{ ...td, color: repo.has_readme ? GREEN : "#d1d5db", textAlign: "center" }}>
                    {repo.has_readme ? "✓" : "✗"}
                  </td>
                  <td style={td}>
                    {repoFlags.map((f) => (
                      <FlagBadge key={f.flag_type} flagType={f.flag_type} evidence={f.evidence} />
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {repos.length > 20 && (
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 10 }}>
          + {repos.length - 20} more repos
        </p>
      )}
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
    <div style={{ marginBottom: 12 }}>
      <span
        onClick={() => setOpen((o) => !o)}
        style={{ fontSize: 12, color: "#9ca3af", cursor: "pointer", padding: "6px 0", display: "block" }}
      >
        {open ? "▾" : "▸"} Debug ({errors.length} pipeline error{errors.length !== 1 ? "s" : ""})
      </span>
      {open && (
        <div style={{ background: BG, borderRadius: 6, padding: 12, fontSize: 12, color: "#64748b", marginTop: 6, border: `1px solid ${BORDER}` }}>
          {errors.map((e, i) => <div key={i} style={{ marginBottom: 4 }}>· {e}</div>)}
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
    <div style={{ textAlign: "center", padding: "24px 0" }}>
      {!submitted ? (
        <>
          <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 14 }}>
            Was this report useful?
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16 }}>
            {[["yes", "👍"], ["no", "👎"]].map(([val, emoji]) => (
              <button
                key={val}
                onClick={() => setRating(val)}
                style={{
                  padding: "8px 18px",
                  border: `1px solid ${rating === val ? (val === "yes" ? GREEN : "#dc2626") : BORDER}`,
                  background: "#fff",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 17,
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          {rating && (
            <>
              <textarea
                placeholder="Tell us why (optional)..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{
                  width: "100%",
                  maxWidth: 480,
                  padding: 10,
                  borderRadius: 6,
                  border: `1px solid ${BORDER}`,
                  fontSize: 13,
                  resize: "vertical",
                  minHeight: 72,
                  marginBottom: 12,
                  boxSizing: "border-box",
                  fontFamily: FONT,
                }}
              />
              <br />
              <button
                onClick={handleSubmit}
                style={{
                  padding: "9px 22px",
                  background: PRIMARY,
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Submit
              </button>
            </>
          )}
        </>
      ) : (
        <p style={{ color: GREEN, margin: 0, fontSize: 14, fontWeight: 500 }}>
          Thanks for your feedback!
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function ReportView({ state, onReset }) {
  const { github_data, skill_verification, project_matches, final_report, errors } = state;
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
      <div style={{ maxWidth: 600, margin: "60px auto", textAlign: "center", fontFamily: FONT }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
        <h2 style={{ color: PRIMARY, marginBottom: 8, letterSpacing: "-0.02em" }}>Verification Failed</h2>
        <p style={{ color: "#64748b", marginBottom: 24, fontSize: 14 }}>
          {notFoundError
            ? "GitHub username not found. Please check the username and try again."
            : "Something went wrong. Please try again."}
        </p>
        {(errors || []).map((err, i) => (
          <p key={i} style={{ color: "#dc2626", fontSize: 13 }}>{err}</p>
        ))}
        <button
          onClick={onReset}
          style={{ marginTop: 16, padding: "11px 24px", background: PRIMARY, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 600 }}
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
    <div ref={reportRef} style={{ maxWidth: 840, margin: "0 auto", fontFamily: FONT }}>
      <ReportTopBar
        state={state}
        onReset={onReset}
        onDownloadPDF={downloadPDF}
        generatingPDF={generatingPDF}
        onShare={shareReport}
        shareCopied={shareCopied}
      />

      <RecruiterBriefSection
        brief={recruiterBrief}
        skills={skill_verification}
        githubData={github_data}
      />

      <Overview recruiter={recruiter} />
      <SkillEvidence skills={skill_verification} hasResume={hasResume} />
      <ProjectMatches matches={project_matches} />
      <ActivityPatterns recruiter={recruiter} />
      <InterviewQuestions recruiter={recruiter} hasResume={hasResume} />
      <RepoTable
        repos={github_data?.repos}
        username={state.github_username}
        reposCapped={github_data?.repos_capped}
        totalReposFound={github_data?.total_repos_found}
      />

      <DebugInfo errors={errors} hidden={generatingPDF} />

      {/* Limitations */}
      <div style={{
        margin: "16px 0",
        padding: "14px 18px",
        background: "#fffbeb",
        border: "1px solid #fde68a",
        borderRadius: 6,
        fontSize: 13,
        color: "#92400e",
        lineHeight: 1.65,
      }}>
        <span style={{ fontWeight: 600 }}>Limitations.</span>{" "}
        This report covers public GitHub activity only. Many legitimate candidates do meaningful
        work in private repositories, coursework environments, or local machines. Thin public
        activity is not evidence of fabrication — it's one signal among many to discuss with the
        candidate.
      </div>

      <FeedbackWidget githubUsername={state.github_username} runId={state.run_id || state.id} hidden={generatingPDF} />
    </div>
  );
}
