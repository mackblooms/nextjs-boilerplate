"use client";

import { Suspense } from "react";
import { HomeContent } from "../page";

function WorldCupFallback() {
  return <div className="page-shell" style={{ padding: 16 }}>Loading world cup...</div>;
}

export default function WorldCupPage() {
  return (
    <Suspense fallback={<WorldCupFallback />}>
      <HomeContent forcedCompetitionSlug="world-cup" />
    </Suspense>
  );
}
