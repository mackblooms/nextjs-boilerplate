import { UiLoadingState } from "../components/ui/primitives";

export default function Loading() {
  return <div className="page-shell"><UiLoadingState title="Loading the season board" description="Getting team prices and projections ready." /></div>;
}
