import Link from "next/link";
import HowItWorksRulesContent from "../components/HowItWorksRulesContent";

export default function HowItWorksPage() {
  return (
    <main className="page-shell legal-doc" style={{ maxWidth: 900 }}>
      <h1 className="page-title" style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>
        bracketball: How It Works
      </h1>

      <p style={{ marginTop: 0, lineHeight: 1.6 }}>
        This page starts with draft budget rules, then scoring rules.
      </p>

      <HowItWorksRulesContent />

      <div style={{ marginTop: 30 }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 12px",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 900,
          }}
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
