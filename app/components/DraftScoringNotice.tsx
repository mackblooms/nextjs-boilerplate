"use client";

import { useState } from "react";
import type { CompetitionSlug } from "@/lib/competitions";

export default function DraftScoringNotice({
  competitionSlug,
}: {
  competitionSlug: CompetitionSlug;
}) {
  const [hidden, setHidden] = useState(false);

  function openScoringGuide() {
    window.dispatchEvent(new CustomEvent("bb:open-how-it-works", { detail: { competitionSlug } }));
  }

  function hideNotice() {
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <aside className="draft-scoring-notice" aria-label="Scoring guide">
      <div className="draft-scoring-notice__copy">
        <div className="draft-scoring-notice__eyebrow">scoring</div>
        <p>Need a quick rules check while you draft?</p>
      </div>
      <div className="draft-scoring-notice__actions">
        <button type="button" className="ui-btn ui-btn--md ui-btn--primary" onClick={openScoringGuide}>
          How it works
        </button>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={hideNotice}>
          Hide
        </button>
      </div>
    </aside>
  );
}
