import { scoreTeamWinsDetailed, worldCupProjectedWinPoints, type ScoringGame } from "./scoring";
import { getEliminatedTeamIds } from "./teamElimination";
import { WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT, type WorldCupRound } from "./worldCupBracket";

export type WorldCupPathTeam = {
  id: string;
  name: string;
  seed?: number | null;
  seed_in_region?: number | null;
  cost?: number | null;
  region?: string | null;
  logo_url?: string | null;
};

export type WorldCupPathGame = ScoringGame & {
  id: string;
  round: string;
  region: string | null;
  slot: number;
  status?: string | null;
  start_time?: string | null;
  game_date?: string | null;
};

export type WorldCupPathStep = {
  round: string;
  label: string;
  gameId: string | null;
  opponentTeamId: string | null;
  opponentLabel: string;
  pointsWithWin: number;
};

export type WorldCupTeamPath = {
  team: WorldCupPathTeam;
  status: "alive" | "eliminated" | "champion" | "unknown";
  statusLabel: string;
  cost: number | null;
  earnedPoints: number;
  nextGame: WorldCupPathGame | null;
  nextOpponentTeamId: string | null;
  nextOpponentLabel: string | null;
  nextWinPoints: number | null;
  remainingMaxPoints: number;
  path: WorldCupPathStep[];
};

const ROUND_LABELS: Record<string, string> = {
  GROUP: "group stage",
  GROUP_ADVANCE: "group advance",
  R32: "round of 32",
  S16: "round of 16",
  E8: "quarterfinal",
  F4: "semifinal",
  CHIP: "final",
};

const FUTURE_ROUNDS: WorldCupRound[] = ["R32", "S16", "E8", "F4", "CHIP"];

function normalizeRound(round: unknown) {
  return String(round ?? "").trim().toUpperCase();
}

function roundOrder(round: unknown) {
  const order: Record<string, number> = {
    GROUP: 1,
    R32: 2,
    S16: 3,
    E8: 4,
    F4: 5,
    CHIP: 6,
  };
  return order[normalizeRound(round)] ?? 99;
}

function isFinalGame(game: WorldCupPathGame) {
  const status = String(game.status ?? "").trim().toLowerCase();
  return (
    Boolean(game.winner_team_id) ||
    status.startsWith("final") ||
    status === "ft" ||
    status === "full time" ||
    status === "full-time" ||
    status === "post" ||
    status.startsWith("complete")
  );
}

function teamSeed(team: WorldCupPathTeam) {
  const value = team.seed_in_region ?? team.seed ?? null;
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function gameHasTeam(game: WorldCupPathGame, teamId: string) {
  return game.team1_id === teamId || game.team2_id === teamId;
}

function opponentFor(game: WorldCupPathGame, teamId: string) {
  if (game.team1_id === teamId) return game.team2_id ?? null;
  if (game.team2_id === teamId) return game.team1_id ?? null;
  return null;
}

function nextTarget(round: string, slot: number) {
  const normalizedRound = normalizeRound(round);
  if (normalizedRound === "F4") {
    if (slot === 1) return { round: "CHIP" as const, slot: 1, side: "team1_id" as const };
    if (slot === 2) return { round: "CHIP" as const, slot: 1, side: "team2_id" as const };
    return null;
  }
  return WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`${normalizedRound}|${slot}`] ?? null;
}

function teamLabel(teamById: Map<string, WorldCupPathTeam>, teamId: string | null) {
  if (!teamId) return "TBD";
  return teamById.get(teamId)?.name ?? "TBD";
}

function projectedOpponentLabel(round: string, slot: number) {
  const feeders = Object.entries(WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT)
    .filter(([, target]) => target.round === round && target.slot === slot)
    .map(([source]) => source)
    .sort();
  if (feeders.length === 0) return "TBD";
  return feeders
    .map((source) => {
      const [sourceRound, sourceSlot] = source.split("|");
      return `winner ${ROUND_LABELS[sourceRound] ?? sourceRound} ${sourceSlot}`;
    })
    .join(" / ");
}

export function buildWorldCupTeamPath(
  teamId: string | null,
  teams: WorldCupPathTeam[],
  games: WorldCupPathGame[],
): WorldCupTeamPath | null {
  if (!teamId) return null;
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const team = teamById.get(teamId);
  if (!team) return null;

  const orderedGames = [...games].sort((a, b) => roundOrder(a.round) - roundOrder(b.round) || a.slot - b.slot);
  const teamSeedById = new Map(teams.map((candidate) => [candidate.id, teamSeed(candidate)]));
  const teamCostById = new Map(teams.map((candidate) => [candidate.id, candidate.cost ?? null]));
  const scoring = scoreTeamWinsDetailed(orderedGames, teamSeedById, {
    competitionSlug: "world-cup",
    teamCostById,
  });
  const earnedPoints = scoring.teamScoresByTeamId.get(team.id) ?? 0;
  const eliminatedTeamIds = getEliminatedTeamIds(orderedGames, "world-cup");
  const teamGames = orderedGames.filter((game) => gameHasTeam(game, team.id));
  const wonFinal = teamGames.some((game) => normalizeRound(game.round) === "CHIP" && game.winner_team_id === team.id);
  const lostGame = teamGames.find((game) => isFinalGame(game) && game.winner_team_id && game.winner_team_id !== team.id);
  const nextGame = teamGames.find((game) => !isFinalGame(game)) ?? null;
  const status = wonFinal
    ? "champion"
    : eliminatedTeamIds.has(team.id) || Boolean(lostGame)
      ? "eliminated"
      : nextGame
        ? "alive"
        : "unknown";
  const statusLabel =
    status === "champion"
      ? "Champion"
      : status === "eliminated"
        ? lostGame
          ? `Eliminated in ${ROUND_LABELS[normalizeRound(lostGame.round)] ?? normalizeRound(lostGame.round)}`
          : "Eliminated in group stage"
        : status === "alive"
          ? "Still alive"
          : "Status pending";

  const cost = team.cost ?? null;
  const nextOpponentTeamId = nextGame ? opponentFor(nextGame, team.id) : null;
  const nextOpponentLabel = nextGame ? teamLabel(teamById, nextOpponentTeamId) : null;
  const nextWinPoints = nextGame ? worldCupProjectedWinPoints(cost, normalizeRound(nextGame.round)) : null;
  const path: WorldCupPathStep[] = [];

  if (nextGame) {
    let currentRound = normalizeRound(nextGame.round) as WorldCupRound;
    let currentSlot = nextGame.slot;
    let currentOpponentId = nextOpponentTeamId;
    let currentOpponentLabel = nextOpponentLabel ?? "TBD";

    while (true) {
      path.push({
        round: currentRound,
        label: ROUND_LABELS[currentRound] ?? currentRound,
        gameId: currentRound === normalizeRound(nextGame.round) && currentSlot === nextGame.slot ? nextGame.id : null,
        opponentTeamId: currentOpponentId,
        opponentLabel: currentOpponentLabel,
        pointsWithWin: worldCupProjectedWinPoints(cost, currentRound),
      });
      if (currentRound === "CHIP") break;

      const target = nextTarget(currentRound, currentSlot);
      if (!target) break;
      currentRound = target.round;
      currentSlot = target.slot;
      const projectedGame = orderedGames.find(
        (game) => normalizeRound(game.round) === currentRound && game.slot === currentSlot,
      );
      currentOpponentId = projectedGame
        ? target.side === "team1_id"
          ? projectedGame.team2_id
          : projectedGame.team1_id
        : null;
      currentOpponentLabel = currentOpponentId
        ? teamLabel(teamById, currentOpponentId)
        : projectedOpponentLabel(currentRound, currentSlot);
    }
  } else if (status === "alive") {
    for (const round of FUTURE_ROUNDS) {
      path.push({
        round,
        label: ROUND_LABELS[round] ?? round,
        gameId: null,
        opponentTeamId: null,
        opponentLabel: "TBD",
        pointsWithWin: worldCupProjectedWinPoints(cost, round),
      });
    }
  }

  return {
    team,
    status,
    statusLabel,
    cost,
    earnedPoints,
    nextGame,
    nextOpponentTeamId,
    nextOpponentLabel,
    nextWinPoints,
    remainingMaxPoints: path.reduce((sum, step) => sum + step.pointsWithWin, 0),
    path,
  };
}
