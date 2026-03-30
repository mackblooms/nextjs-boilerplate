import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { scoreEntries, type ScoringGame } from "@/lib/scoring";

type PoolEntryRow = {
  entry_id: string;
  display_name: string | null;
};

type EntryPickRow = {
  entry_id: string;
  team_id: string;
};

type TeamRow = {
  id: string;
  seed_in_region: number | null;
  espn_team_id: string | number | null;
};

type GameRow = {
  id: string;
  round: string | null;
  region: string | null;
  slot: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type MutableGame = {
  id: string;
  round: string | null;
  region: string | null;
  slot: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type EspnTeam = {
  id?: string | number;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  winner?: boolean | string | number;
  team?: EspnTeam;
};

type EspnCompetition = {
  competitors?: EspnCompetitor[];
  tournamentId?: number | string;
  notes?: Array<{ headline?: string }>;
  headlines?: Array<{ shortLinkText?: string; description?: string }>;
};

type EspnStatus = {
  type?: {
    state?: string;
    completed?: boolean;
  };
};

type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  status?: EspnStatus;
  competitions?: EspnCompetition[];
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

type EspnSummary = {
  predictor?: {
    homeTeam?: { gameProjection?: string | number };
    awayTeam?: { gameProjection?: string | number };
  };
  winprobability?: Array<{ homeWinPercentage?: string | number }>;
  header?: {
    competitions?: Array<{
      competitors?: Array<{ team?: { id?: string | number }; winner?: boolean | string | number }>;
    }>;
  };
};

type PairProbability = {
  team_a: string;
  team_b: string;
  probability_team_a: number;
  source: string;
};

type RankedScore = {
  entry_id: string;
  score: number;
  rank: number;
};

type ForecastEntry = {
  entry_id: string;
  current_score: number;
  current_rank: number;
  expected_score: number;
  expected_add: number;
  projected_score_most_likely: number;
  projected_add_most_likely: number;
  projected_rank_most_likely: number;
  expected_rank: number;
  first_place_probability: number;
};

type PropagationTarget = {
  round: "R32" | "S16" | "E8" | "F4" | "CHIP";
  region: string | null;
  slot: number;
  side: "team1_id" | "team2_id";
};

const ROUND_ORDER: Record<string, number> = {
  R64: 1,
  R32: 2,
  S16: 3,
  E8: 4,
  F4: 5,
  CHIP: 6,
};

const SCOREBOARD_WINDOW_DAYS = 3;
const LOOKAHEAD_DAYS = 30;
const MONTE_CARLO_RUNS = 5000;
const MONTE_CARLO_RUNS_LIGHT = 2500;
const ROUND_SEQUENCE: Array<keyof typeof ROUND_ORDER> = ["R64", "R32", "S16", "E8", "F4", "CHIP"];

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function norm(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function pairKey(teamA: string, teamB: string) {
  return teamA < teamB ? `${teamA}|${teamB}` : `${teamB}|${teamA}`;
}

function gameKey(round: string, region: string | null, slot: number): string {
  if (round === "R64" || round === "R32" || round === "S16" || round === "E8") {
    return `${round}|${norm(region)}|${slot}`;
  }
  return `${round}|${slot}`;
}

function nextTargetForWinner(game: MutableGame): PropagationTarget | null {
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
    };
  }

  if (round === "E8") {
    const region = norm(game.region);
    if (region === "west") return { round: "F4", region: null, slot: 1, side: "team1_id" };
    if (region === "south") return { round: "F4", region: null, slot: 1, side: "team2_id" };
    if (region === "east") return { round: "F4", region: null, slot: 2, side: "team1_id" };
    if (region === "midwest") return { round: "F4", region: null, slot: 2, side: "team2_id" };
    return null;
  }

  if (round === "F4") {
    if (slot === 1) return { round: "CHIP", region: null, slot: 1, side: "team1_id" };
    if (slot === 2) return { round: "CHIP", region: null, slot: 1, side: "team2_id" };
    return null;
  }

  return null;
}

function toEtYyyymmdd(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}${month}${day}`;
}

function shiftDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function normalizeProbability(raw: unknown): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  if (value > 1 && value <= 100) return value / 100;
  if (value > 1) return null;
  return value;
}

function normalizePair(homeRaw: number | null, awayRaw: number | null) {
  const sum = (homeRaw ?? 0) + (awayRaw ?? 0);
  if (!Number.isFinite(sum) || sum <= 0) return { home: 0.5, away: 0.5 };
  return {
    home: (homeRaw ?? 0) / sum,
    away: (awayRaw ?? 0) / sum,
  };
}

function isWinnerFlag(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function isNcaaTournamentEvent(event: EspnEvent) {
  const competition = event.competitions?.[0];
  if (!competition) return false;

  const tournamentId = Number(competition.tournamentId);
  if (Number.isFinite(tournamentId)) return tournamentId === 22;

  const notes = (competition.notes ?? []).map((note) => note.headline ?? "").join(" ");
  const headlines = (competition.headlines ?? [])
    .map((headline) => `${headline.shortLinkText ?? ""} ${headline.description ?? ""}`)
    .join(" ");
  const text = `${notes} ${headlines} ${event.name ?? ""} ${event.shortName ?? ""}`.toLowerCase();
  return (
    text.includes("men's basketball championship") ||
    text.includes("mens basketball championship") ||
    text.includes("ncaa tournament") ||
    text.includes("ncaa men's tournament") ||
    text.includes("march madness")
  );
}

function extractProbabilities(
  summary: EspnSummary | null,
  state: string,
  homeEspnTeamId: string,
  awayEspnTeamId: string,
) {
  const homePredictor = normalizeProbability(summary?.predictor?.homeTeam?.gameProjection);
  const awayPredictor = normalizeProbability(summary?.predictor?.awayTeam?.gameProjection);
  if (homePredictor != null && awayPredictor != null) {
    const normalized = normalizePair(homePredictor, awayPredictor);
    return { home: normalized.home, away: normalized.away, source: "predictor" };
  }

  const winRows = Array.isArray(summary?.winprobability) ? summary.winprobability : [];
  if (winRows.length > 0) {
    const last = winRows[winRows.length - 1];
    const homeLive = normalizeProbability(last?.homeWinPercentage);
    if (homeLive != null) {
      const normalized = normalizePair(homeLive, 1 - homeLive);
      return {
        home: normalized.home,
        away: normalized.away,
        source: "live_win_probability",
      };
    }
  }

  if (state === "post") {
    const competitors = summary?.header?.competitions?.[0]?.competitors ?? [];
    const home = competitors.find((competitor) => String(competitor?.team?.id ?? "") === homeEspnTeamId);
    const away = competitors.find((competitor) => String(competitor?.team?.id ?? "") === awayEspnTeamId);
    if (isWinnerFlag(home?.winner)) return { home: 1, away: 0, source: "final_result" };
    if (isWinnerFlag(away?.winner)) return { home: 0, away: 1, source: "final_result" };
  }

  return { home: 0.5, away: 0.5, source: "fallback_even" };
}

function rankByScore(rows: Array<{ entry_id: string; score: number; label: string }>): RankedScore[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  let previousScore: number | null = null;
  let previousRank = 0;
  return sorted.map((row, index) => {
    const rank = previousScore === row.score ? previousRank : index + 1;
    previousScore = row.score;
    previousRank = rank;
    return { entry_id: row.entry_id, score: row.score, rank };
  });
}

function roundOrder(round: string | null | undefined) {
  return ROUND_ORDER[String(round ?? "").toUpperCase()] ?? 0;
}

function resolveForecastHorizonRound(games: GameRow[]) {
  for (const round of ROUND_SEQUENCE) {
    const roundGames = games.filter((game) => String(game.round ?? "").toUpperCase() === round);
    if (roundGames.length === 0) continue;
  }
  return "CHIP";
}

function cloneGames(games: GameRow[]): MutableGame[] {
  return games.map((game) => ({
    id: game.id,
    round: game.round,
    region: game.region,
    slot: game.slot,
    team1_id: game.team1_id,
    team2_id: game.team2_id,
    winner_team_id: game.winner_team_id,
  }));
}

function sortedGamesForSimulation(games: MutableGame[]) {
  return [...games].sort((a, b) => {
    const aOrder = ROUND_ORDER[String(a.round ?? "").toUpperCase()] ?? 99;
    const bOrder = ROUND_ORDER[String(b.round ?? "").toUpperCase()] ?? 99;
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aRegion = String(a.region ?? "");
    const bRegion = String(b.region ?? "");
    if (aRegion !== bRegion) return aRegion.localeCompare(bRegion);
    return Number(a.slot ?? 0) - Number(b.slot ?? 0);
  });
}

function seedFallbackWinProbability(
  teamAId: string,
  teamBId: string,
  teamSeedById: Map<string, number | null>,
) {
  const seedA = teamSeedById.get(teamAId) ?? 8.5;
  const seedB = teamSeedById.get(teamBId) ?? 8.5;
  const strengthDiff = seedB - seedA;
  const probabilityA = 1 / (1 + Math.exp(-0.28 * strengthDiff));
  return Math.min(0.98, Math.max(0.02, probabilityA));
}

function probabilityForTeamA(
  teamAId: string,
  teamBId: string,
  pairProbabilities: Map<string, PairProbability>,
  teamSeedById: Map<string, number | null>,
) {
  const key = pairKey(teamAId, teamBId);
  const pair = pairProbabilities.get(key);
  if (pair) {
    if (pair.team_a === teamAId) return pair.probability_team_a;
    return 1 - pair.probability_team_a;
  }
  return seedFallbackWinProbability(teamAId, teamBId, teamSeedById);
}

function propagateWinner(source: MutableGame, byKey: Map<string, MutableGame>) {
  const winner = source.winner_team_id ? String(source.winner_team_id) : null;
  if (!winner) return;
  const targetRef = nextTargetForWinner(source);
  if (!targetRef) return;

  const target = byKey.get(gameKey(targetRef.round, targetRef.region, targetRef.slot));
  if (!target) return;

  if (targetRef.side === "team1_id" && target.team1_id !== winner) target.team1_id = winner;
  if (targetRef.side === "team2_id" && target.team2_id !== winner) target.team2_id = winner;

  if (
    target.winner_team_id &&
    target.winner_team_id !== target.team1_id &&
    target.winner_team_id !== target.team2_id
  ) {
    target.winner_team_id = null;
  }
}

function runBracketProjection(
  baseGames: GameRow[],
  pairProbabilities: Map<string, PairProbability>,
  teamSeedById: Map<string, number | null>,
  chooseMostLikely: boolean,
  maxRoundOrder: number,
) {
  const games = cloneGames(baseGames);
  const sorted = sortedGamesForSimulation(games);
  const byKey = new Map<string, MutableGame>();
  for (const game of sorted) {
    const round = String(game.round ?? "").toUpperCase();
    const slot = Number(game.slot);
    if (!round || !Number.isFinite(slot) || slot < 1) continue;
    byKey.set(gameKey(round, game.region ?? null, Math.trunc(slot)), game);
  }

  for (const game of sorted) {
    const gameRoundOrder = roundOrder(game.round);
    if (gameRoundOrder === 0 || gameRoundOrder > maxRoundOrder) continue;

    if (game.winner_team_id) {
      propagateWinner(game, byKey);
      continue;
    }

    if (!game.team1_id || !game.team2_id) continue;
    const team1 = String(game.team1_id);
    const team2 = String(game.team2_id);
    const probabilityTeam1 = probabilityForTeamA(team1, team2, pairProbabilities, teamSeedById);
    const team1Wins = chooseMostLikely ? probabilityTeam1 >= 0.5 : Math.random() < probabilityTeam1;
    game.winner_team_id = team1Wins ? team1 : team2;
    propagateWinner(game, byKey);
  }

  return games.map((game) => ({
    round: String(game.round ?? ""),
    team1_id: game.team1_id,
    team2_id: game.team2_id,
    winner_team_id: game.winner_team_id,
  })) as ScoringGame[];
}

async function requirePoolAccess(req: Request, poolId: string) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: NextResponse.json({ error: "Missing authorization token." }, { status: 401 }) };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData.user) {
    return {
      error: NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 }),
    };
  }

  const requesterId = authData.user.id;
  const { data: memberRow, error: memberErr } = await supabaseAdmin
    .from("pool_members")
    .select("pool_id")
    .eq("pool_id", poolId)
    .eq("user_id", requesterId)
    .maybeSingle();

  if (memberErr) {
    return { error: NextResponse.json({ error: memberErr.message }, { status: 400 }) };
  }

  if (!memberRow) {
    return {
      error: NextResponse.json(
        { error: "Join this pool to view forecast standings." },
        { status: 403 },
      ),
    };
  }

  return { userId: requesterId };
}

async function fetchPairProbabilities(
  localTeamIdByEspnTeamId: Map<string, string>,
) {
  const dateRanges: string[] = [];
  for (let day = 0; day <= LOOKAHEAD_DAYS; day += SCOREBOARD_WINDOW_DAYS) {
    const endDay = Math.min(day + SCOREBOARD_WINDOW_DAYS - 1, LOOKAHEAD_DAYS);
    const start = toEtYyyymmdd(shiftDate(day));
    const end = toEtYyyymmdd(shiftDate(endDay));
    dateRanges.push(start === end ? start : `${start}-${end}`);
  }

  const scoreboardPayloads = await Promise.all(
    dateRanges.map(async (dateRange) => {
      const endpoint =
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateRange}&groups=50&limit=500`;
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) return null;
      return (await response.json()) as EspnScoreboard;
    }),
  );

  const eventById = new Map<string, EspnEvent>();
  for (const payload of scoreboardPayloads) {
    if (!payload) continue;
    for (const event of payload.events ?? []) {
      if (!isNcaaTournamentEvent(event)) continue;
      const id = String(event.id ?? "").trim();
      if (!id) continue;
      if (!eventById.has(id)) eventById.set(id, event);
    }
  }

  const pairProbabilities = new Map<string, PairProbability>();
  await Promise.all(
    Array.from(eventById.values()).map(async (event) => {
      const competition = event.competitions?.[0];
      const away = competition?.competitors?.find((competitor) => competitor.homeAway === "away");
      const home = competition?.competitors?.find((competitor) => competitor.homeAway === "home");
      if (!away?.team?.id || !home?.team?.id) return;

      const awayLocal = localTeamIdByEspnTeamId.get(String(away.team.id)) ?? null;
      const homeLocal = localTeamIdByEspnTeamId.get(String(home.team.id)) ?? null;
      if (!awayLocal || !homeLocal) return;

      const eventId = String(event.id ?? "").trim();
      if (!eventId) return;
      const summaryResponse = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${encodeURIComponent(eventId)}`,
        { cache: "no-store" },
      ).catch(() => null);

      const summary =
        summaryResponse && summaryResponse.ok
          ? ((await summaryResponse.json()) as EspnSummary)
          : null;

      const state = String(event.status?.type?.state ?? "pre").toLowerCase();
      const probabilities = extractProbabilities(
        summary,
        state,
        String(home.team.id),
        String(away.team.id),
      );

      const key = pairKey(awayLocal, homeLocal);
      if (awayLocal < homeLocal) {
        pairProbabilities.set(key, {
          team_a: awayLocal,
          team_b: homeLocal,
          probability_team_a: probabilities.away,
          source: probabilities.source,
        });
      } else {
        pairProbabilities.set(key, {
          team_a: homeLocal,
          team_b: awayLocal,
          probability_team_a: probabilities.home,
          source: probabilities.source,
        });
      }
    }),
  );

  return pairProbabilities;
}

export async function GET(req: Request) {
  try {
    const poolId = new URL(req.url).searchParams.get("poolId")?.trim() ?? "";
    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const access = await requirePoolAccess(req, poolId);
    if ("error" in access) return access.error;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: baseRowsData, error: baseRowsErr } = await supabaseAdmin
      .from("pool_leaderboard")
      .select("entry_id,display_name")
      .eq("pool_id", poolId);

    if (baseRowsErr) {
      return NextResponse.json({ error: baseRowsErr.message }, { status: 400 });
    }

    const baseRows = (baseRowsData ?? []) as PoolEntryRow[];
    if (baseRows.length === 0) {
      return NextResponse.json({
        ok: true,
        generated_at: new Date().toISOString(),
        horizon: "round",
        horizon_round: "CHIP",
        entries: [],
      });
    }

    const entryIds = baseRows.map((row) => row.entry_id);
    const [picksResult, teamsResult, gamesResult] = await Promise.all([
      supabaseAdmin.from("entry_picks").select("entry_id,team_id").in("entry_id", entryIds),
      supabaseAdmin.from("teams").select("id,seed_in_region,espn_team_id"),
      supabaseAdmin
        .from("games")
        .select("id,round,region,slot,team1_id,team2_id,winner_team_id"),
    ]);

    if (picksResult.error) {
      return NextResponse.json({ error: picksResult.error.message }, { status: 400 });
    }
    if (teamsResult.error) {
      return NextResponse.json({ error: teamsResult.error.message }, { status: 400 });
    }
    if (gamesResult.error) {
      return NextResponse.json({ error: gamesResult.error.message }, { status: 400 });
    }

    const picksRows = (picksResult.data ?? []) as EntryPickRow[];
    const teams = (teamsResult.data ?? []) as TeamRow[];
    const games = ((gamesResult.data ?? []) as GameRow[]).map((game) => ({
      ...game,
      id: String(game.id),
    }));

    const picksByEntry = new Map<string, string[]>();
    for (const entryId of entryIds) picksByEntry.set(entryId, []);
    for (const pick of picksRows) {
      const picks = picksByEntry.get(pick.entry_id) ?? [];
      picks.push(pick.team_id);
      picksByEntry.set(pick.entry_id, picks);
    }

    const teamSeedById = new Map<string, number | null>();
    const localTeamIdByEspnTeamId = new Map<string, string>();
    for (const team of teams) {
      const teamId = String(team.id);
      teamSeedById.set(teamId, team.seed_in_region ?? null);
      if (team.espn_team_id != null) {
        localTeamIdByEspnTeamId.set(String(team.espn_team_id), teamId);
      }
    }

    const pairProbabilities = await fetchPairProbabilities(localTeamIdByEspnTeamId);
    const horizonRound = resolveForecastHorizonRound(games);
    const horizonRoundOrder = ROUND_ORDER[horizonRound] ?? ROUND_ORDER.CHIP;
    const scopedGames = games.filter(
      (game) => roundOrder(game.round) > 0 && roundOrder(game.round) <= horizonRoundOrder,
    );

    const currentScoringGames = scopedGames.map((game) => ({
      round: String(game.round ?? ""),
      team1_id: game.team1_id,
      team2_id: game.team2_id,
      winner_team_id: game.winner_team_id,
    })) as ScoringGame[];

    const currentScores = scoreEntries(currentScoringGames, teamSeedById, picksByEntry);
    const labelByEntryId = new Map<string, string>();
    for (const row of baseRows) {
      labelByEntryId.set(row.entry_id, row.display_name?.trim() || row.entry_id.slice(0, 8));
    }

    const currentRows = entryIds.map((entryId) => ({
      entry_id: entryId,
      score: currentScores.totalScoreByEntryId.get(entryId) ?? 0,
      label: labelByEntryId.get(entryId) ?? entryId.slice(0, 8),
    }));
    const currentRanked = rankByScore(currentRows);
    const currentRankByEntryId = new Map(currentRanked.map((row) => [row.entry_id, row.rank]));
    const currentScoreByEntryId = new Map(currentRows.map((row) => [row.entry_id, row.score]));

    const unresolvedGameCount = scopedGames.filter((game) => !game.winner_team_id).length;
    const monteCarloRuns =
      unresolvedGameCount >= 16 ? MONTE_CARLO_RUNS_LIGHT : MONTE_CARLO_RUNS;

    const expectedScoreAccumulator = new Map<string, number>();
    const expectedRankAccumulator = new Map<string, number>();
    const firstPlaceCountByEntry = new Map<string, number>();
    for (const entryId of entryIds) {
      expectedScoreAccumulator.set(entryId, 0);
      expectedRankAccumulator.set(entryId, 0);
      firstPlaceCountByEntry.set(entryId, 0);
    }

    const runs = Math.max(1, unresolvedGameCount > 0 ? monteCarloRuns : 1);
    for (let run = 0; run < runs; run += 1) {
      const projectedGames = runBracketProjection(
        scopedGames,
        pairProbabilities,
        teamSeedById,
        false,
        horizonRoundOrder,
      );
      const projectedScores = scoreEntries(projectedGames, teamSeedById, picksByEntry);

      const scoreRows = entryIds.map((entryId) => ({
        entry_id: entryId,
        score: projectedScores.totalScoreByEntryId.get(entryId) ?? 0,
        label: labelByEntryId.get(entryId) ?? entryId.slice(0, 8),
      }));
      const ranked = rankByScore(scoreRows);
      const rankByEntry = new Map(ranked.map((row) => [row.entry_id, row.rank]));

      for (const entryId of entryIds) {
        expectedScoreAccumulator.set(
          entryId,
          (expectedScoreAccumulator.get(entryId) ?? 0) +
            (projectedScores.totalScoreByEntryId.get(entryId) ?? 0),
        );
        expectedRankAccumulator.set(
          entryId,
          (expectedRankAccumulator.get(entryId) ?? 0) + (rankByEntry.get(entryId) ?? 0),
        );
        if ((rankByEntry.get(entryId) ?? 0) === 1) {
          firstPlaceCountByEntry.set(entryId, (firstPlaceCountByEntry.get(entryId) ?? 0) + 1);
        }
      }
    }

    const mostLikelyGames = runBracketProjection(
      scopedGames,
      pairProbabilities,
      teamSeedById,
      true,
      horizonRoundOrder,
    );
    const mostLikelyScores = scoreEntries(mostLikelyGames, teamSeedById, picksByEntry);
    const mostLikelyRows = entryIds.map((entryId) => ({
      entry_id: entryId,
      score: mostLikelyScores.totalScoreByEntryId.get(entryId) ?? 0,
      label: labelByEntryId.get(entryId) ?? entryId.slice(0, 8),
    }));
    const mostLikelyRanked = rankByScore(mostLikelyRows);
    const mostLikelyRankByEntryId = new Map(mostLikelyRanked.map((row) => [row.entry_id, row.rank]));

    const entries: ForecastEntry[] = entryIds
      .map((entryId) => {
        const currentScore = currentScoreByEntryId.get(entryId) ?? 0;
        const expectedScore = (expectedScoreAccumulator.get(entryId) ?? 0) / runs;
        const projectedMostLikely = mostLikelyScores.totalScoreByEntryId.get(entryId) ?? currentScore;

        return {
          entry_id: entryId,
          current_score: currentScore,
          current_rank: currentRankByEntryId.get(entryId) ?? 0,
          expected_score: Number(expectedScore.toFixed(2)),
          expected_add: Number((expectedScore - currentScore).toFixed(2)),
          projected_score_most_likely: projectedMostLikely,
          projected_add_most_likely: projectedMostLikely - currentScore,
          projected_rank_most_likely: mostLikelyRankByEntryId.get(entryId) ?? 0,
          expected_rank: Number(((expectedRankAccumulator.get(entryId) ?? 0) / runs).toFixed(3)),
          first_place_probability: Number(
            ((((firstPlaceCountByEntry.get(entryId) ?? 0) / runs) * 100)).toFixed(1),
          ),
        };
      })
      .sort((a, b) => b.expected_score - a.expected_score || a.entry_id.localeCompare(b.entry_id));

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      horizon: "round",
      horizon_round: horizonRound,
      monte_carlo_runs: runs,
      unresolved_game_count: unresolvedGameCount,
      pair_probability_count: pairProbabilities.size,
      entries,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
