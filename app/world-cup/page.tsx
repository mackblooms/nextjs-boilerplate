import Link from "next/link";
import CompetitionSwitcher from "../components/CompetitionSwitcher";

export default function WorldCupPage() {
  return (
    <main className="page-shell page-shell--stack world-cup-page-shell">
      <CompetitionSwitcher activeCompetition="world-cup" compact />

      <section className="page-surface world-cup-hero">
        <div className="world-cup-hero-copy">
          <span className="competition-switcher-eyebrow">soccer</span>
          <h1 className="page-title">world cup bracketball is coming.</h1>
          <p className="page-subtitle">
            a dedicated world cup game is on the way, with its own drafts, pools, scoring, and
            tournament experience.
          </p>
          <div className="world-cup-actions">
            <Link href="/sports" className="ui-btn ui-btn--md ui-btn--secondary">
              choose another sport
            </Link>
            <Link href="/" className="ui-btn ui-btn--md ui-btn--primary">
              open march madness
            </Link>
          </div>
        </div>

        <div className="world-cup-format" aria-label="World cup game preview">
          <span>world cup mode</span>
          <strong>group stage</strong>
          <strong>knockout rounds</strong>
          <strong>global pools</strong>
        </div>
      </section>
    </main>
  );
}
