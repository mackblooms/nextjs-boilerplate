import { UiLoadingState } from '@/app/components/ui/primitives';
export default function Loading() {
  return <main className="page-shell"><UiLoadingState title="Loading player profiles" description="Preparing rankings and projections." /></main>;
}
