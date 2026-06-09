"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { resolveActiveCompetitionFromLocation } from "@/lib/activeCompetition";
import { getCompetition } from "@/lib/competitions";
import HowItWorksRulesContent from "../components/HowItWorksRulesContent";
import BackArrowButton from "../components/BackArrowButton";

export default function HowItWorksClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const competitionSlug = resolveActiveCompetitionFromLocation(pathname, searchParams);
  const competition = getCompetition(competitionSlug);

  return (
    <main className="page-shell legal-doc" style={{ maxWidth: 900 }}>
      <div className="back-arrow-row">
        <BackArrowButton fallbackHref={competition.href} />
      </div>

      <h1 className="page-title" style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>
        bracketball: how it works
      </h1>

      <p style={{ marginTop: 0, lineHeight: 1.6 }}>
        this page starts with draft budget rules, then scoring rules.
      </p>

      <HowItWorksRulesContent competitionSlug={competitionSlug} />
    </main>
  );
}
