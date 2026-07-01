import React from "react";
import { useNavigate } from "react-router-dom";

const PRIMARY = "#0f172a";
const BORDER = "#e2e8f0";
const BG = "#f8fafc";
const GREEN = "#16a34a";
const FONT = "system-ui, -apple-system, 'Inter', 'Segoe UI', sans-serif";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function BlackButton({ children, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: PRIMARY,
        color: "#fff",
        border: "none",
        borderRadius: 6,
        padding: "12px 22px",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        letterSpacing: "-0.01em",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

function Navbar({ onTry }) {
  return (
    <nav style={{
      background: "#fff",
      borderBottom: `1px solid ${BORDER}`,
      padding: "0 24px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      height: 56,
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <a href="/" style={{ fontSize: 17, fontWeight: 800, color: PRIMARY, textDecoration: "none", letterSpacing: "-0.03em" }}>
          VerifAI
        </a>
        <div style={{ display: "flex", gap: 24 }}>
          {[["How it works", "#how-it-works"], ["The report", "#the-report"], ["Pricing", "#pricing"]].map(([label, href]) => (
            <a key={href} href={href} style={{ fontSize: 14, color: "#64748b", textDecoration: "none" }}>
              {label}
            </a>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <a href="/login" style={{ fontSize: 14, color: "#374151", textDecoration: "none" }}>Sign in</a>
        <BlackButton onClick={onTry} style={{ padding: "8px 16px" }}>Try it free →</BlackButton>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({ onTry }) {
  return (
    <section style={{ background: "#fff", padding: "80px 24px 72px", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{
          display: "inline-block",
          background: "#f1f5f9",
          border: `1px solid ${BORDER}`,
          borderRadius: 20,
          padding: "4px 14px",
          fontSize: 11,
          fontWeight: 600,
          color: "#475569",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 32,
        }}>
          Now in private beta for technical recruiters
        </div>

        <h1 style={{
          fontSize: "clamp(40px, 6vw, 68px)",
          fontWeight: 800,
          color: PRIMARY,
          lineHeight: 1.05,
          letterSpacing: "-0.04em",
          margin: "0 0 28px",
          maxWidth: 720,
        }}>
          The reference check<br />
          for people who've<br />
          never had a job.
        </h1>

        <p style={{
          fontSize: "clamp(15px, 2vw, 17px)",
          color: "#475569",
          lineHeight: 1.7,
          maxWidth: 520,
          margin: "0 0 36px",
        }}>
          VerifAI cross-references a candidate's GitHub activity against their resume
          claims — giving recruiters a structured intelligence report in under two minutes.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
          <BlackButton onClick={onTry} style={{ padding: "13px 24px", fontSize: 15 }}>
            Try it free →
          </BlackButton>
          <a href="#the-report" style={{ fontSize: 15, color: "#374151", textDecoration: "none" }}>
            See a sample report
          </a>
        </div>

        <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
          Five free verifications. No credit card required.
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
    <section id="how-it-works" style={{ padding: "72px 24px", background: "#fff", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "180px 1fr", gap: 64, alignItems: "start" }}>
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#9ca3af",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}>
            The Problem
          </div>
        </div>
        <div>
          <h2 style={{
            fontSize: "clamp(22px, 3.5vw, 36px)",
            fontWeight: 800,
            color: PRIMARY,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            margin: "0 0 20px",
          }}>
            Every junior resume looks the same. Same school tier. Same GPA range.
            Same three tutorial projects.
          </h2>
          <p style={{ fontSize: 16, color: "#64748b", lineHeight: 1.8, margin: 0 }}>
            Companies make critical hiring decisions based on claims they can't verify. AI-generated
            resumes pass every ATS filter. Polished GitHub portfolios get built overnight. The result:
            bad hires, wasted interviews, and talented people passed over because they can't compete
            with fabricated credentials.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Who it's for
// ---------------------------------------------------------------------------

function WhoItsFor() {
  return (
    <section style={{ padding: "72px 24px", background: BG, borderBottom: `1px solid ${BORDER}` }}>
      <div style={{
        maxWidth: 900,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 56,
        alignItems: "start",
      }}>
        <h2 style={{
          fontSize: "clamp(22px, 3.5vw, 34px)",
          fontWeight: 800,
          color: PRIMARY,
          letterSpacing: "-0.03em",
          lineHeight: 1.2,
          margin: 0,
        }}>
          Built for hiring junior engineers, new grads, and interns.
        </h2>
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          {["Hiring junior engineers", "New-grad recruiting", "Internship pipelines"].map((item, i, arr) => (
            <div key={item} style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 20px",
              borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <span style={{ color: GREEN, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 15, color: "#374151", fontWeight: 500 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Report — Quick Brief preview card
// ---------------------------------------------------------------------------

function QuickBriefPreview() {
  const confirmedSkills = ["Python", "FastAPI", "Docker", "PostgreSQL"];
  const unconfirmedSkills = ["React", "Kubernetes"];

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${BORDER}`,
      borderLeft: "3px solid #475569",
      borderRadius: 8,
      padding: "24px 28px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Quick Brief
        </span>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>@alex_chen · 4m ago</span>
      </div>

      <p style={{ fontSize: 16, fontWeight: 700, color: PRIMARY, margin: "0 0 22px", lineHeight: 1.4 }}>
        Python backend developer with evidence of production-grade work. GitHub history
        is consistent with the claims made on the resume.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Strongest Work
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: PRIMARY, fontWeight: 600, marginBottom: 4 }}>
            api-gateway
          </div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
            FastAPI service, 340 commits, active since Jan 2023
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Skills
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {confirmedSkills.map((s) => (
              <span key={s} style={{ border: `1px solid ${GREEN}`, color: GREEN, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 500 }}>
                {s}
              </span>
            ))}
            {unconfirmedSkills.map((s) => (
              <span key={s} style={{ border: "1px solid #d1d5db", color: "#9ca3af", borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 500 }}>
                {s}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            Profile Consistency
          </div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.65 }}>
            <div>• 3 years of consistent commit history</div>
            <div>• Timeline aligns with claimed experience</div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Full Technical Evidence Below
        </span>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>24 repos · 1,847 commits</span>
      </div>
    </div>
  );
}

function TheReport({ onTry }) {
  return (
    <section id="the-report" style={{ padding: "72px 24px", background: "#fff", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{
        maxWidth: 900,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 56,
        alignItems: "start",
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 16 }}>
            The Report
          </div>
          <h2 style={{
            fontSize: "clamp(22px, 3vw, 30px)",
            fontWeight: 800,
            color: PRIMARY,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
            margin: "0 0 16px",
          }}>
            A Quick Brief built for the first 60 seconds of a resume review.
          </h2>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.75, marginBottom: 24 }}>
            Every report opens with a plain-language brief: one-liner, strongest work,
            confirmed skills, and a neutral consistency read. No verdict — just evidence.
          </p>
          <BlackButton onClick={onTry}>Try it free →</BlackButton>
        </div>
        <QuickBriefPreview />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function Pricing({ onTry }) {
  return (
    <section id="pricing" style={{ padding: "80px 24px", background: BG, borderBottom: `1px solid ${BORDER}`, textAlign: "center" }}>
      <div style={{ maxWidth: 580, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 20 }}>
          Pricing
        </div>
        <h2 style={{
          fontSize: "clamp(24px, 3.5vw, 36px)",
          fontWeight: 800,
          color: PRIMARY,
          letterSpacing: "-0.03em",
          lineHeight: 1.2,
          margin: "0 0 16px",
        }}>
          Five free verifications.<br />Then contact us for access.
        </h2>
        <p style={{ fontSize: 15, color: "#64748b", lineHeight: 1.75, marginBottom: 32 }}>
          We're onboarding teams one at a time during the private beta. Pricing scales
          with seats and volume — no surprise per-call fees.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <BlackButton onClick={onTry} style={{ padding: "13px 24px", fontSize: 15 }}>
            Start verifying →
          </BlackButton>
          <a
            href="mailto:team@verifai.dev"
            style={{
              padding: "12px 18px",
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              fontSize: 14,
              color: "#374151",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            team@verifai.dev
          </a>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer style={{ background: "#fff", borderTop: `1px solid ${BORDER}`, padding: "20px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: PRIMARY, letterSpacing: "-0.03em" }}>VerifAI</span>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>© 2026</span>
          <a href="#" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>Privacy</a>
          <a href="mailto:team@verifai.dev" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>team@verifai.dev</a>
          <a href="https://github.com/subbarayudu8660/VerifAI" target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>GitHub</a>
        </div>
      </div>
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
    <div style={{ fontFamily: FONT, margin: 0, background: "#fff" }}>
      <Navbar onTry={goToVerify} />
      <Hero onTry={goToVerify} />
      <Problem />
      <WhoItsFor />
      <TheReport onTry={goToVerify} />
      <Pricing onTry={goToVerify} />
      <Footer />
    </div>
  );
}
