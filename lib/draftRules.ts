export const DRAFT_BUDGET = 100;
export const MAX_1_SEEDS = 2;
export const MAX_2_SEEDS = 2;
export const MAX_14_TO_16_SEEDS = 6;
export const WORLD_CUP_ELITE_MINIMUM_COST = 20;
export const WORLD_CUP_MAX_ELITE_TEAMS = 3;

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
  selectedCount: number;
  countWorldCupElite: number;
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

export function summarizeDraft(
  teamIds: Iterable<string>,
  teamById: Map<string, DraftableTeam>,
  competitionSlug = "march-madness",
): DraftSummary {
  let totalCost = 0;
  let count1 = 0;
  let count2 = 0;
  let count141516 = 0;
  let selectedCount = 0;
  let countWorldCupElite = 0;

  for (const teamId of teamIds) {
    const team = teamById.get(teamId);
    if (!team) continue;

    selectedCount += 1;
    totalCost += team.cost;
    if (team.seed === 1) count1 += 1;
    if (team.seed === 2) count2 += 1;
    if (team.seed >= 14 && team.seed <= 16) count141516 += 1;
    if (team.cost >= WORLD_CUP_ELITE_MINIMUM_COST) countWorldCupElite += 1;
  }

  const remaining = DRAFT_BUDGET - totalCost;
  const detail = { totalCost, remaining, count1, count2, count141516, selectedCount, countWorldCupElite };
  const error = competitionSlug === "world-cup"
    ? getWorldCupDraftError(detail.totalCost, detail.countWorldCupElite)
    : getDraftError(detail);

  return {
    ...detail,
    isValid: error === null,
    error,
  };
}

function getWorldCupDraftError(totalCost: number, countEliteTeams: number) {
  if (totalCost > DRAFT_BUDGET) {
    return `Draft is over budget (${totalCost}/${DRAFT_BUDGET}).`;
  }
  return countEliteTeams > WORLD_CUP_MAX_ELITE_TEAMS
    ? `World Cup drafts can include at most ${WORLD_CUP_MAX_ELITE_TEAMS} Gold-or-higher teams priced ${WORLD_CUP_ELITE_MINIMUM_COST} or higher.`
    : null;
}

export function sortDraftTeamsBySeedName<T extends { seed: number; name: string }>(a: T, b: T) {
  if (a.seed !== b.seed) return a.seed - b.seed;
  return a.name.localeCompare(b.name);
}

export function sortDraftTeamsForCompetition<T extends { cost: number; seed: number; name: string }>(
  competitionSlug: string,
) {
  return (a: T, b: T) => {
    if (competitionSlug === "world-cup" && a.cost !== b.cost) return b.cost - a.cost;
    return sortDraftTeamsBySeedName(a, b);
  };
}
