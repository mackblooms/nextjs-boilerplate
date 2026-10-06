'use client';
import { UiButton, UiErrorState } from '@/app/components/ui/primitives';
export default function ErrorState({ reset }: { reset: () => void }) {
  return <main className="page-shell"><UiErrorState title="Player profiles unavailable" description="We couldn’t load the player data. Please try again." /><UiButton onClick={reset}>Try again</UiButton></main>;
}
