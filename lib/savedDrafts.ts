export type SavedDraftRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type SavedDraftPickRow = {
  draft_id: string;
  team_id: string;
};

export function isMissingSavedDraftTablesError(message?: string | null) {
  const lowered = (message ?? "").toLowerCase();
  return lowered.includes("saved_drafts") || lowered.includes("saved_draft_picks");
}

export function defaultDraftName(position: number) {
  return `My Draft ${Math.max(1, position)}`;
}

export function clonePickMap(source: Map<string, Set<string>>) {
  return new Map(Array.from(source.entries()).map(([key, value]) => [key, new Set(value)]));
}

export function sameTeamSet(a: Iterable<string>, b: Iterable<string>) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const value of setA) {
    if (!setB.has(value)) return false;
  }
  return true;
}
