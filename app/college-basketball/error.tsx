"use client";

import { UiButton, UiErrorState } from "../components/ui/primitives";

export default function SeasonError({ reset }: { reset: () => void }) {
  return <div className="page-shell"><UiErrorState title="The season board couldn’t load" description="Your saved draft stays on this device." actions={<UiButton onClick={reset}>Try again</UiButton>} /></div>;
}
