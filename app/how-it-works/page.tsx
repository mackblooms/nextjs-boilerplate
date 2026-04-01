import HowItWorksRulesContent from "../components/HowItWorksRulesContent";
import BackArrowButton from "../components/BackArrowButton";

export default function HowItWorksPage() {
  return (
    <main className="page-shell legal-doc" style={{ maxWidth: 900 }}>
      <div className="back-arrow-row">
        <BackArrowButton fallbackHref="/" />
      </div>

      <h1 className="page-title" style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>
        bracketball: How It Works
      </h1>

      <p style={{ marginTop: 0, lineHeight: 1.6 }}>
        This page starts with draft budget rules, then scoring rules.
      </p>

      <HowItWorksRulesContent />

    </main>
  );
}
