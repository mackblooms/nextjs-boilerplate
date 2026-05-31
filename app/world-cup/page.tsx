import Link from "next/link";
import CompetitionSwitcher from "../components/CompetitionSwitcher";

export default function WorldCupPage() {
  return (
    <main className="page-shell page-shell--stack world-cup-page-shell">
      <CompetitionSwitcher activeCompetition="world-cup" compact />

      <section className="page-surface world-cup-hero">
        <div className="world-cup-hero-copy">
          <span className="competition-switcher-eyebrow">soccer</span>
          <h1 className="page-title">world cup bracketball.</h1>
          <p className="page-subtitle">
            draft national teams by value, enter pools with friends, and follow the 48-team field
            from the group stage through the knockout rounds.
          </p>
          <div className="world-cup-actions">
            <Link href="/drafts?competition=world-cup" className="ui-btn ui-btn--md ui-btn--primary">
              open drafts
            </Link>
            <Link href="/pools?competition=world-cup" className="ui-btn ui-btn--md ui-btn--secondary">
              open pools
            </Link>
            <Link href="/sports" className="ui-btn ui-btn--md ui-btn--secondary">
              choose another sport
            </Link>
          </div>
        </div>

        <div className="world-cup-format" aria-label="World cup game preview">
          <span>world cup 2026</span>
          <strong>48 national teams</strong>
          <strong>12 groups of four</strong>
          <strong>round of 32 knockout</strong>
        </div>
      </section>
    </main>
  );
}
