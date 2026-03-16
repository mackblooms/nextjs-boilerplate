export const DRAFT_BUDGET = 100;
export const MAX_1_SEEDS = 2;
export const MAX_2_SEEDS = 2;
export const MAX_14_TO_16_SEEDS = 6;

export type DraftableTeam = {
  id: string;
  name: string;
  seed: number;
  cost: number;
};

export type DraftSummary = {
  totalCost: number;
  remaining: number;
  count1: number;
  count2: number;
  count141516: number;
  isValid: boolean;
  error: string | null;
};

function getDraftError(summary: Omit<DraftSummary, "isValid" | "error">): string | null {
  if (summary.totalCost > DRAFT_BUDGET) {
    return `Draft is over budget (${summary.totalCost}/${DRAFT_BUDGET}).`;
  }
  if (summary.count1 > MAX_1_SEEDS) {
    return `Draft exceeds max ${MAX_1_SEEDS} one-seeds.`;
  }
  if (summary.count2 > MAX_2_SEEDS) {
    return `Draft exceeds max ${MAX_2_SEEDS} two-seeds.`;
  }
  if (summary.count141516 > MAX_14_TO_16_SEEDS) {
    return `Draft exceeds max ${MAX_14_TO_16_SEEDS} teams seeded 14-16.`;
  }
  return null;
}

export function summarizeDraft(teamIds: Iterable<string>, teamById: Map<string, DraftableTeam>): DraftSummary {
  let totalCost = 0;
  let count1 = 0;
  let count2 = 0;
  let count141516 = 0;

  for (const teamId of teamIds) {
    const team = teamById.get(teamId);
    if (!team) continue;

    totalCost += team.cost;
    if (team.seed === 1) count1 += 1;
    if (team.seed === 2) count2 += 1;
    if (team.seed >= 14 && team.seed <= 16) count141516 += 1;
  }

  const remaining = DRAFT_BUDGET - totalCost;
  const detail = { totalCost, remaining, count1, count2, count141516 };
  const error = getDraftError(detail);

  return {
    ...detail,
    isValid: error === null,
    error,
  };
}

export function sortDraftTeamsBySeedName<T extends { seed: number; name: string }>(a: T, b: T) {
  if (a.seed !== b.seed) return a.seed - b.seed;
  return a.name.localeCompare(b.name);
}
