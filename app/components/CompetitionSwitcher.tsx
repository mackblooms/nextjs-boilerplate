import Link from "next/link";
import { competitions, type CompetitionSlug } from "@/lib/competitions";

export default function CompetitionSwitcher({
  activeCompetition,
  compact = false,
}: {
  activeCompetition?: CompetitionSlug;
  compact?: boolean;
}) {
  return (
    <section
      className={`competition-switcher${compact ? " competition-switcher--compact" : ""}`}
      aria-label="Choose a sport and tournament"
    >
      <div className="competition-switcher-heading">
        <span className="competition-switcher-eyebrow">choose your game</span>
        {!compact ? <h2>sports</h2> : null}
      </div>
      <div className="competition-switcher-grid">
        {competitions.map((competition) => {
          const isActive = activeCompetition === competition.slug;

          return (
            <Link
              href={competition.href}
              className="competition-choice"
              data-active={isActive ? "true" : undefined}
              key={competition.slug}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="competition-choice-topline">
                <span className="competition-choice-sport">{competition.sport}</span>
                <span className="competition-choice-status" data-status={competition.status}>
                  {competition.statusLabel}
                </span>
              </span>
              <strong>{competition.shortName}</strong>
              {!compact ? <span>{competition.description}</span> : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
