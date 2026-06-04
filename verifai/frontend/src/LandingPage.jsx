import React from "react";
import { useNavigate } from "react-router-dom";

const INDIGO = "#6366f1";
const INDIGO_DARK = "#4f46e5";
const NAVY = "#0f1117";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function Section({ children, style }) {
  return (
    <section style={{ padding: "80px 24px", ...style }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function Label({ children }) {
  return (
    <div style={{
      display: "inline-block",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: INDIGO,
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function PrimaryButton({ children, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? INDIGO_DARK : INDIGO,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "14px 28px",
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.15s",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ onTry }) {
  return (
    <section style={{
      background: NAVY,
      padding: "100px 24px 90px",
      textAlign: "center",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{
          display: "inline-block",
          background: "rgba(99,102,241,0.15)",
          border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 20,
          padding: "5px 14px",
          fontSize: 12,
          fontWeight: 600,
          color: "#a5b4fc",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 28,
        }}>
          Technical hiring intelligence
        </div>

        <h1 style={{
          fontSize: "clamp(36px, 6vw, 58px)",
          fontWeight: 800,
          color: "#fff",
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          margin: "0 0 24px",
        }}>
          Stop hiring resumes.<br />
          Start hiring builders.
        </h1>

        <p style={{
          fontSize: "clamp(16px, 2vw, 19px)",
          color: "#9ca3af",
          lineHeight: 1.65,
          maxWidth: 580,
          margin: "0 auto 40px",
        }}>
          Built for hiring junior engineers, new grads, and interns. VerifAI
          analyzes a candidate's public GitHub activity, verifies their resume
          claims against real evidence, and generates a structured intelligence
          report — so you know exactly what to probe before the interview.
        </p>

        <PrimaryButton onClick={onTry}>Try it free →</PrimaryButton>

        <p style={{
          fontSize: 13,
          color: "#6b7280",
          marginTop: 16,
          lineHeight: 1.6,
          maxWidth: 500,
          margin: "16px auto 0",
        }}>
          Designed specifically for junior engineers, new grads, and interns —
          where GitHub is the primary signal and there's no prior work history
          to fall back on.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Problem
// ---------------------------------------------------------------------------

function Problem() {
  return (
    <Section style={{ background: "#fff", borderBottom: "1px solid #f3f4f6" }}>
      <Label>The problem</Label>
      <h2 style={{
        fontSize: "clamp(26px, 4vw, 38px)",
        fontWeight: 800,
        color: "#111827",
        letterSpacing: "-0.025em",
        lineHeight: 1.2,
        margin: "0 0 20px",
        maxWidth: 520,
      }}>
        The hiring process is broken.
      </h2>
      <p style={{
        fontSize: 17,
        color: "#6b7280",
        lineHeight: 1.75,
        maxWidth: 640,
        margin: 0,
      }}>
        Every year, companies make critical hiring decisions based on claims they cannot verify.
        AI-generated resumes pass every ATS filter. Polished GitHub portfolios are built overnight.
        The result: bad hires, wasted interviews, and talented people passed over because they
        can't compete with fabricated credentials.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: "01",
    title: "Enter a GitHub username",
    body: "Paste any GitHub handle and optionally upload a PDF resume. That's all the input needed.",
  },
  {
    n: "02",
    title: "VerifAI researches the candidate",
    body: "Five agents run in sequence: resume parsing, GitHub scraping, AI code detection, claim verification, and report synthesis.",
  },
  {
    n: "03",
    title: "Get an intelligence report",
    body: "Get a structured intelligence report — skill evidence, project verification, activity patterns, and targeted interview questions based on what was actually found.",
  },
];

function HowItWorks() {
  return (
    <Section style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
      <Label>How it works</Label>
      <h2 style={{
        fontSize: "clamp(26px, 4vw, 38px)",
        fontWeight: 800,
        color: "#111827",
        letterSpacing: "-0.025em",
        lineHeight: 1.2,
        margin: "0 0 48px",
      }}>
        Three steps. Minutes, not days.
      </h2>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 24,
      }}>
        {STEPS.map((s) => (
          <div key={s.n} style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "28px 24px",
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: INDIGO,
              letterSpacing: "0.06em",
              marginBottom: 12,
            }}>
              {s.n}
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 10,
              letterSpacing: "-0.01em",
            }}>
              {s.title}
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.65 }}>
              {s.body}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// What you get — report mockup
// ---------------------------------------------------------------------------

function MockFlag({ text, question }) {
  return (
    <div style={{
      borderLeft: "3px solid #f59e0b",
      paddingLeft: 14,
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 4 }}>
        ⚠ {text}
      </div>
      <div style={{
        fontSize: 12,
        color: "#92400e",
        fontStyle: "italic",
        background: "#fffbeb",
        borderRadius: 5,
        padding: "4px 10px",
        display: "inline-block",
      }}>
        Ask: "{question}"
      </div>
    </div>
  );
}

function MockPill({ label, supported }) {
  return (
    <span style={{
      display: "inline-block",
      background: supported ? "#f0fdf4" : "#f3f4f6",
      color: supported ? "#15803d" : "#6b7280",
      borderRadius: 20,
      padding: "3px 11px",
      fontSize: 12,
      fontWeight: 500,
      margin: "3px 4px 3px 0",
    }}>
      {label}
    </span>
  );
}

function ReportMockup() {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      overflow: "hidden",
      fontSize: 13,
      boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
    }}>
      {/* Header bar */}
      <div style={{
        background: "#f9fafb",
        borderBottom: "1px solid #e5e7eb",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        {["#ef4444", "#f59e0b", "#22c55e"].map((c) => (
          <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
        ))}
        <div style={{ marginLeft: 8, fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>
          Candidate Intelligence Report — github_handle
        </div>
      </div>

      <div style={{ padding: "20px 24px" }}>
        {/* Timeline flags */}
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 10 }}>
          Timeline Flags
        </div>
        <MockFlag
          text='Claims "5 years of Python" → First Python commit: Jan 2023'
          question="Walk me through your Python work before 2023 — was this in private repos?"
        />
        <MockFlag
          text="3 repos created within 14 days of application date"
          question="Tell me about these recently created projects — what was the motivation?"
        />

        <div style={{ borderTop: "1px solid #f3f4f6", margin: "18px 0" }} />

        {/* Skill evidence */}
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 8 }}>
          Skill Evidence
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          Supported
        </div>
        <div style={{ marginBottom: 10 }}>
          {["Python", "FastAPI", "Docker", "PyTorch", "SQL"].map((s) => (
            <MockPill key={s} label={s} supported />
          ))}
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
          No public evidence
        </div>
        <div>
          {["React", "Node.js", "MongoDB", "Kubernetes"].map((s) => (
            <MockPill key={s} label={s} />
          ))}
        </div>

        <div style={{ borderTop: "1px solid #f3f4f6", margin: "18px 0" }} />

        {/* Activity patterns */}
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 10 }}>
          Activity Patterns
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Account age", "GitHub since 2022"],
            ["Most active in", "Python, Jupyter Notebook"],
            ["Repo velocity", "3 repos in last 20 days"],
            ["Commit pattern", "Active Jan–Mar, sparse since"],
          ].map(([label, value]) => (
            <div key={label} style={{ background: "#f9fafb", borderRadius: 6, padding: "8px 12px" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                {label}
              </div>
              <div style={{ fontSize: 12, color: "#111827", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WhatYouGet() {
  return (
    <Section style={{ background: "#fff", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        <div>
          <Label>What you get</Label>
          <h2 style={{
            fontSize: "clamp(26px, 4vw, 36px)",
            fontWeight: 800,
            color: "#111827",
            letterSpacing: "-0.025em",
            lineHeight: 1.2,
            margin: "0 0 20px",
          }}>
            A structured report, not a verdict.
          </h2>
          <p style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.75, margin: "0 0 24px" }}>
            VerifAI surfaces evidence and suggests questions — it never tells you
            to hire or pass. That decision stays with you.
          </p>
          <ul style={{ padding: 0, margin: 0, listStyle: "none" }}>
            {[
              "Timeline flags with specific interview questions",
              "Skill evidence — supported vs no public evidence",
              "Activity patterns and repo history",
              "Project claims matched to real repos",
            ].map((item) => (
              <li key={item} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                fontSize: 14,
                color: "#374151",
                marginBottom: 10,
              }}>
                <span style={{ color: INDIGO, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>→</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <ReportMockup />
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Who it's for
// ---------------------------------------------------------------------------

const AUDIENCES = [
  {
    title: "Recruiting agencies",
    body: "Screen more candidates in less time. Surface the ones worth a technical interview.",
  },
  {
    title: "Startups",
    body: "Early hires matter most. Verify before you commit to a process.",
  },
  {
    title: "Technical hiring managers",
    body: "Go into every interview with specific, evidence-based questions already prepared.",
  },
];

function WhoItsFor() {
  return (
    <Section style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
      <Label>Who it's for</Label>
      <h2 style={{
        fontSize: "clamp(26px, 4vw, 36px)",
        fontWeight: 800,
        color: "#111827",
        letterSpacing: "-0.025em",
        lineHeight: 1.2,
        margin: "0 0 40px",
      }}>
        Built for everyone who makes technical hiring decisions.
      </h2>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 20,
      }}>
        {AUDIENCES.map((a) => (
          <div key={a.title} style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "24px 22px",
          }}>
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 8,
              letterSpacing: "-0.01em",
            }}>
              {a.title}
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.65 }}>
              {a.body}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// CTA
// ---------------------------------------------------------------------------

function CTA({ onTry }) {
  return (
    <Section style={{ background: NAVY, textAlign: "center" }}>
      <h2 style={{
        fontSize: "clamp(28px, 4vw, 42px)",
        fontWeight: 800,
        color: "#fff",
        letterSpacing: "-0.025em",
        lineHeight: 1.15,
        margin: "0 0 20px",
      }}>
        Ready to hire builders,<br />not resumes?
      </h2>
      <p style={{
        fontSize: 17,
        color: "#9ca3af",
        marginBottom: 36,
        lineHeight: 1.6,
      }}>
        No account required. Paste a GitHub username and go.
      </p>
      <PrimaryButton onClick={onTry}>Start verifying candidates →</PrimaryButton>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer style={{
      background: NAVY,
      borderTop: "1px solid rgba(255,255,255,0.06)",
      padding: "24px",
      textAlign: "center",
    }}>
      <span style={{ fontSize: 13, color: "#4b5563" }}>
        VerifAI · Built for technical hiring
      </span>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const navigate = useNavigate();
  const goToVerify = () => navigate("/verify");

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", margin: 0 }}>
      <Hero onTry={goToVerify} />
      <Problem />
      <HowItWorks />
      <WhatYouGet />
      <WhoItsFor />
      <CTA onTry={goToVerify} />
      <Footer />
    </div>
  );
}
