import { UiEmptyState, UiLinkButton } from '@/app/components/ui/primitives';
export default function NotFound() {
  return <main className="page-shell"><UiEmptyState title="Player not found" description="This profile may have moved. Search the current player board." /><UiLinkButton href="/cbb/players">Find a player</UiLinkButton></main>;
}
