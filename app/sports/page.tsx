import CompetitionSwitcher from "../components/CompetitionSwitcher";
import { UiLinkButton } from "../components/ui/primitives";

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
      <section className="page-surface sports-hero">
        <span className="competition-switcher-eyebrow">college basketball</span>
        <h2 className="page-title">scout the next season.</h2>
        <p className="page-subtitle">Explore player rankings, factor breakdowns, and experimental stat projections.</p>
        <UiLinkButton href="/cbb/players">Explore player profiles</UiLinkButton>
      </section>
    </main>
  );
}
