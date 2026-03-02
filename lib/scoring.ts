export type ScoringGame = {
  round: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

const BASE_POINTS_BY_ROUND: Record<string, number> = {
  R64: 12,
  R32: 36,
  S16: 84,
  E8: 180,
  F4: 300,
  CHIP: 360,
};

const HISTORIC_BONUS_BY_SEED: Record<number, number> = {
  14: 144,
  15: 240,
  16: 336,
};

export function seedMultiplier(seed: number | null | undefined): number {
  if (!seed || seed < 1 || seed > 16) return 1;
  return 1 + (seed - 1) * 0.035;
}

function calcUpsetBonus(teamSeed: number | null | undefined, opponentSeed: number | null | undefined): number {
  if (!teamSeed || !opponentSeed) return 0;
  return Math.max(0, 12 * (teamSeed - opponentSeed));
}

export function scoreTeamWins(games: ScoringGame[], teamSeedById: Map<string, number | null>): Map<string, number> {
  const totals = new Map<string, number>();
  const historicAwarded = new Set<string>();

  for (const g of games) {
    const winnerId = g.winner_team_id;
    if (!winnerId) continue;

    const base = BASE_POINTS_BY_ROUND[g.round] ?? 0;
    if (!base) continue;

    const winnerSeed = teamSeedById.get(winnerId) ?? null;
    const opponentId = g.team1_id === winnerId ? g.team2_id : g.team2_id === winnerId ? g.team1_id : null;
    const opponentSeed = opponentId ? (teamSeedById.get(opponentId) ?? null) : null;

    const scaledBase = base * seedMultiplier(winnerSeed);
    const upsetBonus = calcUpsetBonus(winnerSeed, opponentSeed);

    let historicBonus = 0;
    if (g.round === "R64" && winnerSeed && HISTORIC_BONUS_BY_SEED[winnerSeed] && !historicAwarded.has(winnerId)) {
      historicBonus = HISTORIC_BONUS_BY_SEED[winnerSeed];
      historicAwarded.add(winnerId);
    }

    const winScore = Math.round(scaledBase + upsetBonus + historicBonus);
    totals.set(winnerId, (totals.get(winnerId) ?? 0) + winScore);
  }

  return totals;
}
