"use client";

import { useEffect, useState } from "react";

const HIDDEN_KEY = "bb:draft-scoring-notice-hidden";

export default function DraftScoringNotice() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(window.localStorage.getItem(HIDDEN_KEY) === "true");
  }, []);

  function openScoringGuide() {
    window.dispatchEvent(new Event("bb:open-how-it-works"));
  }

  function hideNotice() {
    window.localStorage.setItem(HIDDEN_KEY, "true");
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
