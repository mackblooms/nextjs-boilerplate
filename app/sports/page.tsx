import CompetitionSwitcher from "../components/CompetitionSwitcher";

export default function SportsPage() {
  return (
    <main className="page-shell page-shell--stack sports-page-shell">
      <section className="page-surface sports-hero">
        <span className="competition-switcher-eyebrow">bracketball</span>
        <h1 className="page-title">choose your sport.</h1>
        <p className="page-subtitle">
          each tournament has its own drafts, pools, scoring, and live competition.
        </p>
      </section>
      <CompetitionSwitcher />
    </main>
  );
}
