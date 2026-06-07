export type ScoringGame = {
  round: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status?: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
};

export type TeamWinScoreEvent = {
  gameIndex: number;
  round: string;
  teamId: string;
  opponentTeamId: string | null;
  winnerSeed: number | null;
  opponentSeed: number | null;
  basePoints: number;
  seedMultiplier: number;
  scaledBasePoints: number;
  upsetBonus: number;
  historicBonus: number;
  pointsAwarded: number;
};

export type TeamWinScoringResult = {
  teamScoresByTeamId: Map<string, number>;
  eventsByTeamId: Map<string, TeamWinScoreEvent[]>;
};

export type ScoreEntriesResult = {
  teamScoresByTeamId: Map<string, number>;
  totalScoreByEntryId: Map<string, number>;
  perfectR64BonusByEntryId: Map<string, number>;
};

export type ScoringOptions = {
  competitionSlug?: "march-madness" | "world-cup";
  teamCostById?: Map<string, number | null>;
};

const BASE_POINTS_BY_ROUND: Record<string, number> = {
  GROUP: 6,
  R64: 12,
  R32: 36,
  S16: 84,
  E8: 180,
  F4: 300,
  CHIP: 360,
};

const WORLD_CUP_KNOCKOUT_POINTS_BY_ROUND: Record<string, number> = {
  R32: 18,
  S16: 30,
  E8: 48,
  F4: 72,
  CHIP: 100,
};

const WORLD_CUP_VALUE_RUN_BONUS_BY_WIN_ROUND: Record<string, number> = {
  R32: 4,
  S16: 8,
  E8: 14,
  F4: 21,
  CHIP: 30,
};

const HISTORIC_BONUS_BY_SEED: Record<number, number> = {
  14: 24,
  15: 40,
  16: 56,
};

export function seedMultiplier(seed: number | null | undefined): number {
  if (!seed || seed < 1 || seed > 16) return 1;
  return 1 + (seed - 1) * 0.035;
}

function calcUpsetBonus(teamSeed: number | null | undefined, opponentSeed: number | null | undefined): number {
  if (!teamSeed || !opponentSeed) return 0;
  return Math.max(0, 4 * (teamSeed - opponentSeed));
}

function addScoreEvent(
  totals: Map<string, number>,
  eventsByTeamId: Map<string, TeamWinScoreEvent[]>,
  event: TeamWinScoreEvent,
) {
  totals.set(event.teamId, (totals.get(event.teamId) ?? 0) + event.pointsAwarded);
  const teamEvents = eventsByTeamId.get(event.teamId) ?? [];
  teamEvents.push(event);
  eventsByTeamId.set(event.teamId, teamEvents);
}

function isFinalStatus(status: unknown): boolean {
  return String(status ?? "").trim().toLowerCase().startsWith("final");
}

function worldCupTeamCost(teamId: string, options: ScoringOptions): number | null {
  const raw = options.teamCostById?.get(teamId);
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function scoreWorldCupTeamResultsDetailed(
  games: ScoringGame[],
  teamSeedById: Map<string, number | null>,
  options: ScoringOptions,
): TeamWinScoringResult {
  const totals = new Map<string, number>();
  const eventsByTeamId = new Map<string, TeamWinScoreEvent[]>();
  const groupAdvancementAwarded = new Set<string>();

  games.forEach((g, index) => {
    const round = String(g.round ?? "").toUpperCase();

    if (round === "GROUP") {
      if (g.winner_team_id) {
        addScoreEvent(totals, eventsByTeamId, {
          gameIndex: index,
          round,
          teamId: g.winner_team_id,
          opponentTeamId: g.team1_id === g.winner_team_id ? g.team2_id : g.team1_id,
          winnerSeed: teamSeedById.get(g.winner_team_id) ?? null,
          opponentSeed: null,
          basePoints: 6,
          seedMultiplier: 1,
          scaledBasePoints: 6,
          upsetBonus: 0,
          historicBonus: 0,
          pointsAwarded: 6,
        });
        return;
      }

      if (
        isFinalStatus(g.status) &&
        typeof g.team1_score === "number" &&
        typeof g.team2_score === "number" &&
        g.team1_score === g.team2_score
      ) {
        for (const teamId of [g.team1_id, g.team2_id]) {
          if (!teamId) continue;
          addScoreEvent(totals, eventsByTeamId, {
            gameIndex: index,
            round,
            teamId,
            opponentTeamId: teamId === g.team1_id ? g.team2_id : g.team1_id,
            winnerSeed: teamSeedById.get(teamId) ?? null,
            opponentSeed: null,
            basePoints: 2,
            seedMultiplier: 1,
            scaledBasePoints: 2,
            upsetBonus: 0,
            historicBonus: 0,
            pointsAwarded: 2,
          });
        }
      }
      return;
    }

    if (round === "R32") {
      for (const teamId of [g.team1_id, g.team2_id]) {
        if (!teamId || groupAdvancementAwarded.has(teamId)) continue;
        groupAdvancementAwarded.add(teamId);
        const cost = worldCupTeamCost(teamId, options);
        const breakoutBonus = cost != null && cost <= 5 ? 6 : 0;
        addScoreEvent(totals, eventsByTeamId, {
          gameIndex: index,
          round: "GROUP_ADVANCE",
          teamId,
          opponentTeamId: null,
          winnerSeed: teamSeedById.get(teamId) ?? null,
          opponentSeed: null,
          basePoints: 12,
          seedMultiplier: 1,
          scaledBasePoints: 12,
          upsetBonus: 0,
          historicBonus: breakoutBonus,
          pointsAwarded: 12 + breakoutBonus,
        });
      }
    }

    const winnerId = g.winner_team_id;
    if (!winnerId) return;
    const base = WORLD_CUP_KNOCKOUT_POINTS_BY_ROUND[round] ?? 0;
    if (!base) return;

    const cost = worldCupTeamCost(winnerId, options);
    const valueRunBonus = cost != null && cost < 10 ? WORLD_CUP_VALUE_RUN_BONUS_BY_WIN_ROUND[round] ?? 0 : 0;
    const opponentId = g.team1_id === winnerId ? g.team2_id : g.team2_id === winnerId ? g.team1_id : null;
    addScoreEvent(totals, eventsByTeamId, {
      gameIndex: index,
      round,
      teamId: winnerId,
      opponentTeamId: opponentId,
      winnerSeed: teamSeedById.get(winnerId) ?? null,
      opponentSeed: opponentId ? (teamSeedById.get(opponentId) ?? null) : null,
      basePoints: base,
      seedMultiplier: 1,
      scaledBasePoints: base,
      upsetBonus: 0,
      historicBonus: valueRunBonus,
      pointsAwarded: base + valueRunBonus,
    });
  });

  return {
    teamScoresByTeamId: totals,
    eventsByTeamId,
  };
}

export function scoreTeamWinsDetailed(
  games: ScoringGame[],
  teamSeedById: Map<string, number | null>,
  options: ScoringOptions = {},
): TeamWinScoringResult {
  if (options.competitionSlug === "world-cup") {
    return scoreWorldCupTeamResultsDetailed(games, teamSeedById, options);
  }

  const totals = new Map<string, number>();
  const eventsByTeamId = new Map<string, TeamWinScoreEvent[]>();
  const historicAwarded = new Set<string>();

  games.forEach((g, index) => {
    const winnerId = g.winner_team_id;
    if (!winnerId) return;

    const base = BASE_POINTS_BY_ROUND[g.round] ?? 0;
    if (!base) return;

    const winnerSeed = teamSeedById.get(winnerId) ?? null;
    const opponentId = g.team1_id === winnerId ? g.team2_id : g.team2_id === winnerId ? g.team1_id : null;
    const opponentSeed = opponentId ? (teamSeedById.get(opponentId) ?? null) : null;

    const multiplier = seedMultiplier(winnerSeed);
    const scaledBase = base * multiplier;
    const upsetBonus = calcUpsetBonus(winnerSeed, opponentSeed);

    let historicBonus = 0;
    if (g.round === "R64" && winnerSeed && HISTORIC_BONUS_BY_SEED[winnerSeed] && !historicAwarded.has(winnerId)) {
      historicBonus = HISTORIC_BONUS_BY_SEED[winnerSeed];
      historicAwarded.add(winnerId);
    }

    const winScore = Math.round(scaledBase + upsetBonus + historicBonus);
    addScoreEvent(totals, eventsByTeamId, {
      gameIndex: index,
      round: g.round,
      teamId: winnerId,
      opponentTeamId: opponentId ?? null,
      winnerSeed,
      opponentSeed,
      basePoints: base,
      seedMultiplier: multiplier,
      scaledBasePoints: scaledBase,
      upsetBonus,
      historicBonus,
      pointsAwarded: winScore,
    });
  });

  return {
    teamScoresByTeamId: totals,
    eventsByTeamId,
  };
}

export function scoreTeamWins(
  games: ScoringGame[],
  teamSeedById: Map<string, number | null>,
  options: ScoringOptions = {},
): Map<string, number> {
  return scoreTeamWinsDetailed(games, teamSeedById, options).teamScoresByTeamId;
}

export function scoreEntries(
  games: ScoringGame[],
  teamSeedById: Map<string, number | null>,
  picksByEntry: Map<string, string[]>,
  options: ScoringOptions = {},
): ScoreEntriesResult {
  const teamScoresByTeamId = scoreTeamWins(games, teamSeedById, options);
  const totalScoreByEntryId = new Map<string, number>();
  const perfectR64BonusByEntryId = new Map<string, number>();

  const r64Winners = new Set<string>();
  for (const game of games) {
    if (game.round !== "R64" || !game.winner_team_id) continue;
    r64Winners.add(game.winner_team_id);
  }

  for (const [entryId, teamIdsRaw] of picksByEntry.entries()) {
    const uniqueTeamIds = Array.from(new Set(teamIdsRaw.filter(Boolean)));

    const teamTotal = uniqueTeamIds.reduce(
      (sum, teamId) => sum + (teamScoresByTeamId.get(teamId) ?? 0),
      0,
    );

    const wentPerfectR64 =
      options.competitionSlug !== "world-cup" &&
      uniqueTeamIds.length > 0 &&
      uniqueTeamIds.every((teamId) => r64Winners.has(teamId));

    const perfectBonus = wentPerfectR64
      ? uniqueTeamIds.reduce((sum, teamId) => {
          const seed = teamSeedById.get(teamId);
          return sum + (typeof seed === "number" && Number.isFinite(seed) ? seed : 0);
        }, 0)
      : 0;

    totalScoreByEntryId.set(entryId, teamTotal + perfectBonus);
    perfectR64BonusByEntryId.set(entryId, perfectBonus);
  }

  return {
    teamScoresByTeamId,
    totalScoreByEntryId,
    perfectR64BonusByEntryId,
  };
}
