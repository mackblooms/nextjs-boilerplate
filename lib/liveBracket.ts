import { toSchoolDisplayName } from "@/lib/teamNames";

export type LiveOverlayTeam = {
  id: string;
  name: string | null;
  espn_team_id?: string | number | null;
};

export type LiveOverlayGame = {
  id: string;
  round: string;
  region: string | null;
  slot: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

export type LiveOverlayScoreGame = {
  id: string;
  state: "LIVE" | "UPCOMING" | "FINAL";
  detail: string;
  startTime: string | null;
  awayTeamId: string | null;
  homeTeamId: string | null;
  awayTeamName: string;
  homeTeamName: string;
  awayScore: number | null;
  homeScore: number | null;
};

export type MatchedLiveGame = {
  state: "LIVE" | "UPCOMING" | "FINAL";
  detail: string;
  team1Score: number | null;
  team2Score: number | null;
};

function normalizeName(value: string | null | undefined): string {
  return toSchoolDisplayName(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[()'.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function gameKey(round: string, region: string | null, slot: number): string {
  const normalizedRound = String(round ?? "").toUpperCase();
  if (normalizedRound === "R64" || normalizedRound === "R32" || normalizedRound === "S16" || normalizedRound === "E8") {
    return `${normalizedRound}|${String(region ?? "").toLowerCase()}|${slot}`;
  }
  return `${normalizedRound}|${slot}`;
}

function nextTargetForWinner(game: LiveOverlayGame) {
  const round = String(game.round ?? "").toUpperCase();
  const slot = Number(game.slot);
  if (!Number.isFinite(slot) || slot < 1) return null;

  if (round === "R64" || round === "R32" || round === "S16") {
    const nextRound = round === "R64" ? "R32" : round === "R32" ? "S16" : "E8";
    return {
      round: nextRound,
      region: game.region ?? null,
      slot: Math.ceil(slot / 2),
      side: slot % 2 === 1 ? "team1_id" : "team2_id",
    } as const;
  }

  if (round === "E8") {
    const region = String(game.region ?? "").toLowerCase();
    if (region === "east") return { round: "F4", region: null, slot: 1, side: "team1_id" } as const;
    if (region === "south") return { round: "F4", region: null, slot: 1, side: "team2_id" } as const;
    if (region === "west") return { round: "F4", region: null, slot: 2, side: "team1_id" } as const;
    if (region === "midwest") return { round: "F4", region: null, slot: 2, side: "team2_id" } as const;
    return null;
  }

  if (round === "F4") {
    if (slot === 1) return { round: "CHIP", region: null, slot: 1, side: "team1_id" } as const;
    if (slot === 2) return { round: "CHIP", region: null, slot: 1, side: "team2_id" } as const;
  }

  return null;
}

export function matchLiveScoresToGames(
  games: LiveOverlayGame[],
  teams: LiveOverlayTeam[],
  liveScores: LiveOverlayScoreGame[],
): Map<string, MatchedLiveGame> {
  const espnTeamIdByLocalId = new Map<string, string>();
  const normalizedNameByLocalId = new Map<string, string>();
  for (const team of teams) {
    normalizedNameByLocalId.set(team.id, normalizeName(team.name));
    if (team.espn_team_id == null) continue;
    const espnId = String(team.espn_team_id).trim();
    if (espnId) espnTeamIdByLocalId.set(team.id, espnId);
  }

  const liveByEspnPair = new Map<string, LiveOverlayScoreGame>();
  const liveByNamePair = new Map<string, LiveOverlayScoreGame>();
  for (const live of liveScores) {
    if (live.awayTeamId && live.homeTeamId) {
      liveByEspnPair.set(pairKey(live.awayTeamId, live.homeTeamId), live);
    }

    const awayName = normalizeName(live.awayTeamName);
    const homeName = normalizeName(live.homeTeamName);
    if (awayName && homeName) {
      liveByNamePair.set(pairKey(awayName, homeName), live);
    }
  }

  const out = new Map<string, MatchedLiveGame>();
  for (const game of games) {
    if (!game.team1_id || !game.team2_id) continue;

    const team1EspnId = espnTeamIdByLocalId.get(game.team1_id);
    const team2EspnId = espnTeamIdByLocalId.get(game.team2_id);
    let live =
      team1EspnId && team2EspnId
        ? (liveByEspnPair.get(pairKey(team1EspnId, team2EspnId)) ?? null)
        : null;

    if (!live) {
      const team1Name = normalizedNameByLocalId.get(game.team1_id) ?? "";
      const team2Name = normalizedNameByLocalId.get(game.team2_id) ?? "";
      if (team1Name && team2Name) {
        live = liveByNamePair.get(pairKey(team1Name, team2Name)) ?? null;
      }
    }

    if (!live) continue;

    const team1MatchesAway =
      (team1EspnId && live.awayTeamId === team1EspnId) ||
      normalizeName(live.awayTeamName) === normalizedNameByLocalId.get(game.team1_id);
    const team1MatchesHome =
      (team1EspnId && live.homeTeamId === team1EspnId) ||
      normalizeName(live.homeTeamName) === normalizedNameByLocalId.get(game.team1_id);

    if (team1MatchesAway) {
      out.set(game.id, {
        state: live.state,
        detail: live.detail,
        team1Score: live.awayScore,
        team2Score: live.homeScore,
      });
      continue;
    }

    if (team1MatchesHome) {
      out.set(game.id, {
        state: live.state,
        detail: live.detail,
        team1Score: live.homeScore,
        team2Score: live.awayScore,
      });
    }
  }

  return out;
}

export function applyLiveScoreOverlay<TGame extends LiveOverlayGame, TTeam extends LiveOverlayTeam>(
  games: TGame[],
  teams: TTeam[],
  liveScores: LiveOverlayScoreGame[],
): TGame[] {
  const nextGames = games.map((game) => ({ ...game }));
  const liveByGameId = matchLiveScoresToGames(nextGames, teams, liveScores);
  const byKey = new Map<string, TGame>();

  for (const game of nextGames) {
    const slot = Number(game.slot);
    if (!Number.isFinite(slot) || slot < 1) continue;
    byKey.set(gameKey(game.round, game.region ?? null, Math.trunc(slot)), game);
  }

  for (const game of nextGames) {
    const live = liveByGameId.get(game.id);
    if (!live || live.state !== "FINAL") continue;
    if (typeof live.team1Score !== "number" || typeof live.team2Score !== "number") continue;
    if (live.team1Score === live.team2Score) continue;
    if (!game.team1_id || !game.team2_id) continue;
    game.winner_team_id = live.team1Score > live.team2Score ? game.team1_id : game.team2_id;
  }

  const order: Record<string, number> = { R64: 1, R32: 2, S16: 3, E8: 4, F4: 5, CHIP: 6 };
  const sorted = [...nextGames].sort((a, b) => {
    const diff = (order[String(a.round ?? "").toUpperCase()] ?? 99) - (order[String(b.round ?? "").toUpperCase()] ?? 99);
    if (diff !== 0) return diff;
    return Number(a.slot ?? 0) - Number(b.slot ?? 0);
  });

  for (const source of sorted) {
    const targetRef = nextTargetForWinner(source);
    if (!targetRef) continue;
    const target = byKey.get(gameKey(targetRef.round, targetRef.region, targetRef.slot));
    if (!target) continue;

    const winnerId = source.winner_team_id ? String(source.winner_team_id) : null;
    if (targetRef.side === "team1_id") target.team1_id = winnerId;
    if (targetRef.side === "team2_id") target.team2_id = winnerId;

    const nextTeam1 = target.team1_id ? String(target.team1_id) : null;
    const nextTeam2 = target.team2_id ? String(target.team2_id) : null;
    const currentWinner = target.winner_team_id ? String(target.winner_team_id) : null;
    if (currentWinner && currentWinner !== nextTeam1 && currentWinner !== nextTeam2) {
      target.winner_team_id = null;
    }
  }

  return nextGames;
}
