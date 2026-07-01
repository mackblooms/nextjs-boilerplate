"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  resolveActiveCompetitionFromLocation,
  setStoredActiveCompetition,
} from "@/lib/activeCompetition";
import { type CompetitionSlug } from "@/lib/competitions";
import HowItWorksRulesContent from "../components/HowItWorksRulesContent";
import BackArrowButton from "../components/BackArrowButton";

export default function HowItWorksClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [competitionSlug, setCompetitionSlug] = useState<CompetitionSlug>(() =>
    resolveActiveCompetitionFromLocation(pathname, searchParams),
  );

  function selectCompetition(nextCompetitionSlug: CompetitionSlug) {
    setCompetitionSlug(nextCompetitionSlug);
    setStoredActiveCompetition(nextCompetitionSlug);
    const url = new URL(window.location.href);
    url.searchParams.set("competition", nextCompetitionSlug);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <main className="page-shell legal-doc" style={{ maxWidth: 900 }}>
      <div className="back-arrow-row">
        <BackArrowButton fallbackHref="/" />
      </div>

      <h1 className="page-title" style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>
        bracketball: how it works
      </h1>

      <p style={{ marginTop: 0, lineHeight: 1.6 }}>
        this page starts with draft budget rules, then scoring rules.
      </p>

      <div className="how-it-works-toggle" role="group" aria-label="Choose rule set">
        <button
          type="button"
          className="how-it-works-toggle-button"
          data-active={competitionSlug === "world-cup" ? "true" : undefined}
          aria-pressed={competitionSlug === "world-cup"}
          onClick={() => selectCompetition("world-cup")}
        >
          World Cup
        </button>
        <button
          type="button"
          className="how-it-works-toggle-button"
          data-active={competitionSlug === "march-madness" ? "true" : undefined}
          aria-pressed={competitionSlug === "march-madness"}
          onClick={() => selectCompetition("march-madness")}
        >
          March Madness
        </button>
      </div>

      <HowItWorksRulesContent competitionSlug={competitionSlug} />
    </main>
  );
}
