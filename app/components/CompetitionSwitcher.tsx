"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { setStoredActiveCompetition } from "@/lib/activeCompetition";
import { competitionChoices, type CompetitionSlug } from "@/lib/competitions";

export default function CompetitionSwitcher({
  activeCompetition,
  compact = false,
}: {
  activeCompetition?: CompetitionSlug | "college-basketball";
  compact?: boolean;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    const active = grid?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!grid || !active || grid.scrollWidth <= grid.clientWidth) return;
    const container = grid.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    grid.scrollTo({ left: grid.scrollLeft + item.left - container.left - (container.width - item.width) / 2 });
  }, [activeCompetition]);

  return (
    <section
      className={`competition-switcher${compact ? " competition-switcher--compact" : ""}`}
      aria-label="Choose a sport and tournament"
    >
      <div className="competition-switcher-heading">
        <span className="competition-switcher-eyebrow">choose your game</span>
        {!compact ? <h2>sports</h2> : null}
      </div>
      <div className="competition-switcher-grid" ref={gridRef}>
        {competitionChoices.map((competition) => {
          const isActive = activeCompetition === competition.slug;
          const href =
            competition.slug === "march-madness"
              ? "/?competition=march-madness"
              : competition.href;

          return (
            <Link
              href={href}
              className="competition-choice"
              data-active={isActive ? "true" : undefined}
              key={competition.slug}
              aria-current={isActive ? "page" : undefined}
              onClick={() => { if (competition.slug !== "college-basketball") setStoredActiveCompetition(competition.slug); }}
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
