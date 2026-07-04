"use client";

import { Suspense } from "react";
import { HomeContent } from "../page";
import { UiLoadingState } from "../components/ui/primitives";

function WorldCupFallback() {
  return (
    <div className="page-shell" style={{ padding: 16 }}>
      <UiLoadingState
        title="loading world cup"
        description="preparing the world cup dashboard."
      />
    </div>
  );
}

export default function WorldCupPage() {
  return (
    <Suspense fallback={<WorldCupFallback />}>
      <HomeContent forcedCompetitionSlug="world-cup" />
    </Suspense>
  );
}
