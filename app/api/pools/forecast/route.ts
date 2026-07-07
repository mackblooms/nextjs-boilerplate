import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { scoreEntries, type ScoringGame } from "@/lib/scoring";
import { normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";
import { isFirstPlaceDominated } from "@/lib/forecastMath";
import { matchLiveScoresToGames, type LiveOverlayScoreGame } from "@/lib/liveBracket";
import { loadLatestPoolEntries } from "@/lib/latestPoolEntries";
import { getEliminatedTeamIds } from "@/lib/teamElimination";
import { withWorldCupDraftCost } from "@/lib/worldCupRules";
import { applyWorldCupManualResultOverrides } from "@/lib/worldCupManualResults.js";
import {
  WORLD_CUP_FIXED_R32_SLOT_TARGETS,
  WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT,
  WORLD_CUP_THIRD_PLACE_R32_TARGETS,
  groupCodeFromRegion,
  resolveWorldCupThirdPlaceAssignments,
} from "@/lib/worldCupBracket";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TeamRow = {
  id: string;
  name: string | null;
  region: string | null;
  seed_in_region: number | null;
  cost: number | null;
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
  status?: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
};

type MutableGame = {
  id: string;
  round: string | null;
  region: string | null;
  slot: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status?: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
};

type EspnTeam = {
  id?: string | number;
  location?: string;
  shortDisplayName?: string;
  displayName?: string;
  name?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
  winner?: boolean | string | number;
  team?: EspnTeam;
};

type EspnOddsTeam = {
  moneyLine?: string | number;
  american?: string | number;
  americanOdds?: string | number;
  decimal?: string | number;
  decimalOdds?: string | number;
  odds?: string | number;
};

type EspnOdds = {
  homeTeamOdds?: EspnOddsTeam;
  awayTeamOdds?: EspnOddsTeam;
  drawOdds?: EspnOddsTeam;
};

type EspnCompetition = {
  competitors?: EspnCompetitor[];
  tournamentId?: number | string;
  notes?: Array<{ headline?: string }>;
  headlines?: Array<{ shortLinkText?: string; description?: string }>;
  odds?: EspnOdds[];
};

type EspnStatus = {
  type?: {
    state?: string;
    completed?: boolean;
    shortDetail?: string;
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
      competitors?: Array<{
        team?: { id?: string | number };
        winner?: boolean | string | number;
        score?: string;
      }>;
    }>;
  };
};

type PairProbability = {
  team_a: string;
  team_b: string;
  probability_team_a: number;
  source: string;
};

type SoccerMatchProbability = {
  team_a: string;
  team_b: string;
  win_a: number;
  draw: number;
  win_b: number;
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

type WorldCupStanding = {
  teamId: string;
  group: string;
  rank: number;
  points: number;
  goalDifference: number;
  goalsFor: number;
  wins: number;
};

const ROUND_ORDER: Record<string, number> = {
  GROUP: 1,
  R64: 2,
  R32: 3,
  S16: 4,
  E8: 5,
  F4: 6,
  CHIP: 7,
};

const SCOREBOARD_WINDOW_DAYS = 3;
const SCOREBOARD_LOOKBACK_DAYS = 3;
const LOOKAHEAD_DAYS = 45;
const MONTE_CARLO_RUNS = 5000;
const MONTE_CARLO_RUNS_LIGHT = 2500;
const ROUND_SEQUENCE: Array<keyof typeof ROUND_ORDER> = ["GROUP", "R64", "R32", "S16", "E8", "F4", "CHIP"];

function forecastJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return NextResponse.json(body, { ...init, headers });
}

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
    if (region === "east") return { round: "F4", region: null, slot: 1, side: "team1_id" };
    if (region === "south") return { round: "F4", region: null, slot: 1, side: "team2_id" };
    if (region === "west") return { round: "F4", region: null, slot: 2, side: "team1_id" };
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

function toScore(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function toLiveScoreState(status: EspnStatus | undefined): LiveOverlayScoreGame["state"] {
  const state = status?.type?.state?.toLowerCase();
  if (state === "in") return "LIVE";
  if (state === "post" || status?.type?.completed) return "FINAL";
  return "UPCOMING";
}

function competitorDisplayName(competitor: EspnCompetitor | undefined, fallback: string) {
  return (
    competitor?.team?.location?.trim() ||
    competitor?.team?.shortDisplayName?.trim() ||
    competitor?.team?.displayName?.trim() ||
    competitor?.team?.name?.trim() ||
    fallback
  );
}

function liveScoreFromEvent(event: EspnEvent): LiveOverlayScoreGame | null {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const away = competitors.find((competitor) => competitor.homeAway === "away");
  const home = competitors.find((competitor) => competitor.homeAway === "home");
  if (!away || !home) return null;

  const awayTeamName = competitorDisplayName(away, "Away Team");
  const homeTeamName = competitorDisplayName(home, "Home Team");
  return {
    id: String(event.id ?? `${event.date ?? "game"}-${awayTeamName}-${homeTeamName}`),
    state: toLiveScoreState(event.status),
    detail: event.status?.type?.shortDetail?.trim() || "Scheduled",
    startTime: event.date ?? null,
    awayTeamId: away.team?.id != null ? String(away.team.id) : null,
    homeTeamId: home.team?.id != null ? String(home.team.id) : null,
    awayTeamName,
    homeTeamName,
    awayScore: toScore(away.score),
    homeScore: toScore(home.score),
  };
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeTriple(team1Raw: number, drawRaw: number, team2Raw: number) {
  const sum = team1Raw + drawRaw + team2Raw;
  if (!Number.isFinite(sum) || sum <= 0) {
    return { team1: 0.37, draw: 0.26, team2: 0.37 };
  }
  return {
    team1: team1Raw / sum,
    draw: drawRaw / sum,
    team2: team2Raw / sum,
  };
}

function impliedProbabilityFromAmericanOdds(value: number) {
  if (!Number.isFinite(value) || value === 0) return null;
  if (value > 0) return 100 / (value + 100);
  return Math.abs(value) / (Math.abs(value) + 100);
}

function impliedProbabilityFromOdds(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const numeric = Number(text.replace(/[+]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  if (numeric > 1 && numeric < 20 && !text.startsWith("+") && !text.startsWith("-")) {
    return 1 / numeric;
  }
  return impliedProbabilityFromAmericanOdds(numeric);
}

function impliedProbabilityFromOddsTeam(odds: EspnOddsTeam | undefined) {
  if (!odds) return null;
  return (
    impliedProbabilityFromOdds(odds.moneyLine) ??
    impliedProbabilityFromOdds(odds.american) ??
    impliedProbabilityFromOdds(odds.americanOdds) ??
    impliedProbabilityFromOdds(odds.decimal) ??
    impliedProbabilityFromOdds(odds.decimalOdds) ??
    impliedProbabilityFromOdds(odds.odds)
  );
}

function teamStrengthFromCost(cost: number | null | undefined) {
  if (typeof cost !== "number" || !Number.isFinite(cost)) return 12;
  return clamp(cost, 1, 30);
}

function drawProbabilityFromStrengths(team1Strength: number, team2Strength: number) {
  const diff = Math.abs(team1Strength - team2Strength);
  return clamp(0.16 + 0.16 * Math.exp(-diff / 7), 0.11, 0.32);
}

function soccerOutcomeFromStrengths(team1Strength: number, team2Strength: number) {
  const draw = drawProbabilityFromStrengths(team1Strength, team2Strength);
  const team1NonDrawShare = 1 / (1 + Math.exp(-(team1Strength - team2Strength) / 5.5));
  return {
    team1: (1 - draw) * team1NonDrawShare,
    draw,
    team2: (1 - draw) * (1 - team1NonDrawShare),
    source: "pricing_market_prior",
  };
}

function scoreForTeam(game: MutableGame, teamId: string) {
  if (typeof game.team1_score !== "number" || typeof game.team2_score !== "number") return null;
  if (game.team1_id === teamId) return { goalsFor: game.team1_score, goalsAgainst: game.team2_score };
  if (game.team2_id === teamId) return { goalsFor: game.team2_score, goalsAgainst: game.team1_score };
  return null;
}

function compareWorldCupStandings(
  a: Omit<WorldCupStanding, "rank">,
  b: Omit<WorldCupStanding, "rank">,
) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    b.wins - a.wins ||
    a.teamId.localeCompare(b.teamId)
  );
}

function rankProjectedWorldCupGroup(group: string, teams: TeamRow[], games: MutableGame[]) {
  const rows = new Map<string, Omit<WorldCupStanding, "rank">>();
  for (const team of teams) {
    rows.set(String(team.id), {
      teamId: String(team.id),
      group,
      points: 0,
      goalDifference: 0,
      goalsFor: 0,
      wins: 0,
    });
  }

  for (const game of games) {
    if (!game.team1_id || !game.team2_id) continue;
    const team1 = rows.get(game.team1_id);
    const team2 = rows.get(game.team2_id);
    const team1Score = scoreForTeam(game, game.team1_id);
    const team2Score = scoreForTeam(game, game.team2_id);
    if (!team1 || !team2 || !team1Score || !team2Score) continue;

    team1.goalsFor += team1Score.goalsFor;
    team1.goalDifference += team1Score.goalsFor - team1Score.goalsAgainst;
    team2.goalsFor += team2Score.goalsFor;
    team2.goalDifference += team2Score.goalsFor - team2Score.goalsAgainst;

    if (team1Score.goalsFor > team2Score.goalsFor) {
      team1.points += 3;
      team1.wins++;
    } else if (team2Score.goalsFor > team1Score.goalsFor) {
      team2.points += 3;
      team2.wins++;
    } else {
      team1.points += 1;
      team2.points += 1;
    }
  }

  return [...rows.values()]
    .sort(compareWorldCupStandings)
    .map((row, index) => ({ ...row, rank: index + 1 }));
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
  if (state === "post") {
    const competitors = summary?.header?.competitions?.[0]?.competitors ?? [];
    const home = competitors.find((competitor) => String(competitor?.team?.id ?? "") === homeEspnTeamId);
    const away = competitors.find((competitor) => String(competitor?.team?.id ?? "") === awayEspnTeamId);
    if (isWinnerFlag(home?.winner)) return { home: 1, away: 0, source: "final_result" };
    if (isWinnerFlag(away?.winner)) return { home: 0, away: 1, source: "final_result" };
  }

  const winRows = Array.isArray(summary?.winprobability) ? summary.winprobability : [];
  if (state === "in" && winRows.length > 0) {
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

  const homePredictor = normalizeProbability(summary?.predictor?.homeTeam?.gameProjection);
  const awayPredictor = normalizeProbability(summary?.predictor?.awayTeam?.gameProjection);
  if (homePredictor != null && awayPredictor != null) {
    const normalized = normalizePair(homePredictor, awayPredictor);
    return { home: normalized.home, away: normalized.away, source: "predictor" };
  }

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

  return { home: 0.5, away: 0.5, source: "fallback_even" };
}

function extractSoccerProbabilities(
  event: EspnEvent,
  summary: EspnSummary | null,
  state: string,
  homeEspnTeamId: string,
  awayEspnTeamId: string,
  homeStrength: number,
  awayStrength: number,
) {
  const competitors =
    summary?.header?.competitions?.[0]?.competitors ?? event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((competitor) => String(competitor?.team?.id ?? "") === homeEspnTeamId);
  const away = competitors.find((competitor) => String(competitor?.team?.id ?? "") === awayEspnTeamId);

  if (state === "post") {
    if (isWinnerFlag(home?.winner)) return { home: 1, draw: 0, away: 0, source: "final_result" };
    if (isWinnerFlag(away?.winner)) return { home: 0, draw: 0, away: 1, source: "final_result" };
    const homeScore = Number(home?.score);
    const awayScore = Number(away?.score);
    if (Number.isFinite(homeScore) && Number.isFinite(awayScore) && homeScore === awayScore) {
      return { home: 0, draw: 1, away: 0, source: "final_draw" };
    }
  }

  const winRows = Array.isArray(summary?.winprobability) ? summary.winprobability : [];
  if (state === "in" && winRows.length > 0) {
    const last = winRows[winRows.length - 1];
    const homeLive = normalizeProbability(last?.homeWinPercentage);
    if (homeLive != null) {
      const draw = drawProbabilityFromStrengths(homeStrength, awayStrength) * 0.65;
      return {
        home: homeLive * (1 - draw),
        draw,
        away: (1 - homeLive) * (1 - draw),
        source: "live_win_probability",
      };
    }
  }

  const odds = event.competitions?.[0]?.odds?.[0];
  const homeOdds = impliedProbabilityFromOddsTeam(odds?.homeTeamOdds);
  const drawOdds = impliedProbabilityFromOddsTeam(odds?.drawOdds);
  const awayOdds = impliedProbabilityFromOddsTeam(odds?.awayTeamOdds);
  if (homeOdds != null && awayOdds != null) {
    const fallbackDraw = drawOdds ?? drawProbabilityFromStrengths(homeStrength, awayStrength);
    const normalized = normalizeTriple(homeOdds, fallbackDraw, awayOdds);
    return { home: normalized.team1, draw: normalized.draw, away: normalized.team2, source: "market_odds" };
  }

  const homePredictor = normalizeProbability(summary?.predictor?.homeTeam?.gameProjection);
  const awayPredictor = normalizeProbability(summary?.predictor?.awayTeam?.gameProjection);
  if (homePredictor != null && awayPredictor != null) {
    const draw = drawProbabilityFromStrengths(homeStrength, awayStrength);
    const normalized = normalizePair(homePredictor, awayPredictor);
    return {
      home: normalized.home * (1 - draw),
      draw,
      away: normalized.away * (1 - draw),
      source: "espn_predictor",
    };
  }

  if (winRows.length > 0) {
    const last = winRows[winRows.length - 1];
    const homeLive = normalizeProbability(last?.homeWinPercentage);
    if (homeLive != null) {
      const draw = state === "in" ? drawProbabilityFromStrengths(homeStrength, awayStrength) * 0.65 : 0;
      return {
        home: homeLive * (1 - draw),
        draw,
        away: (1 - homeLive) * (1 - draw),
        source: "live_win_probability",
      };
    }
  }

  const prior = soccerOutcomeFromStrengths(homeStrength, awayStrength);
  return { home: prior.team1, draw: prior.draw, away: prior.team2, source: prior.source };
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

function isFinalDraw(game: MutableGame) {
  return (
    String(game.round ?? "").toUpperCase() === "GROUP" &&
    String(game.status ?? "").trim().toLowerCase().startsWith("final") &&
    typeof game.team1_score === "number" &&
    typeof game.team2_score === "number" &&
    game.team1_score === game.team2_score
  );
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
    status: game.status,
    team1_score: game.team1_score,
    team2_score: game.team2_score,
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

function soccerProbabilitiesForMatch(
  team1Id: string,
  team2Id: string,
  probabilities: Map<string, SoccerMatchProbability>,
  teamStrengthById: Map<string, number>,
) {
  const key = pairKey(team1Id, team2Id);
  const found = probabilities.get(key);
  if (found) {
    if (found.team_a === team1Id) {
      return { team1: found.win_a, draw: found.draw, team2: found.win_b, source: found.source };
    }
    return { team1: found.win_b, draw: found.draw, team2: found.win_a, source: found.source };
  }
  return soccerOutcomeFromStrengths(
    teamStrengthById.get(team1Id) ?? 12,
    teamStrengthById.get(team2Id) ?? 12,
  );
}

function chooseSoccerOutcome(
  team1Id: string,
  team2Id: string,
  probabilities: Map<string, SoccerMatchProbability>,
  teamStrengthById: Map<string, number>,
  chooseMostLikely: boolean,
) {
  const outcome = soccerProbabilitiesForMatch(team1Id, team2Id, probabilities, teamStrengthById);
  if (chooseMostLikely) {
    if (outcome.draw >= outcome.team1 && outcome.draw >= outcome.team2) return "draw" as const;
    return outcome.team1 >= outcome.team2 ? "team1" as const : "team2" as const;
  }

  const roll = Math.random();
  if (roll < outcome.team1) return "team1" as const;
  if (roll < outcome.team1 + outcome.draw) return "draw" as const;
  return "team2" as const;
}

function knockoutProbabilityTeam1(
  team1Id: string,
  team2Id: string,
  probabilities: Map<string, SoccerMatchProbability>,
  teamStrengthById: Map<string, number>,
) {
  const outcome = soccerProbabilitiesForMatch(team1Id, team2Id, probabilities, teamStrengthById);
  const decisiveTotal = outcome.team1 + outcome.team2;
  if (!Number.isFinite(decisiveTotal) || decisiveTotal <= 0) return 0.5;
  return outcome.team1 / decisiveTotal;
}

function setProjectedGroupResult(
  game: MutableGame,
  outcome: "team1" | "draw" | "team2",
) {
  game.status = "Final";
  if (outcome === "draw") {
    game.winner_team_id = null;
    game.team1_score = 1;
    game.team2_score = 1;
    return;
  }
  if (outcome === "team1") {
    game.winner_team_id = game.team1_id;
    game.team1_score = 1;
    game.team2_score = 0;
    return;
  }
  game.winner_team_id = game.team2_id;
  game.team1_score = 0;
  game.team2_score = 1;
}

function setProjectedKnockoutResult(
  game: MutableGame,
  team1Wins: boolean,
) {
  game.status = "Final";
  game.winner_team_id = team1Wins ? game.team1_id : game.team2_id;
  game.team1_score = team1Wins ? 1 : 0;
  game.team2_score = team1Wins ? 0 : 1;
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

function propagateWorldCupWinner(source: MutableGame, byKey: Map<string, MutableGame>) {
  const winner = source.winner_team_id ? String(source.winner_team_id) : null;
  if (!winner) return;
  const round = String(source.round ?? "").toUpperCase();
  const slot = Number(source.slot);
  if (!Number.isFinite(slot)) return;
  const targetRef = WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`${round}|${Math.trunc(slot)}`];
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
    if (isFinalDraw(game)) continue;
    const team1 = String(game.team1_id);
    const team2 = String(game.team2_id);
    const probabilityTeam1 = probabilityForTeamA(team1, team2, pairProbabilities, teamSeedById);
    const team1Wins = chooseMostLikely ? probabilityTeam1 >= 0.5 : Math.random() < probabilityTeam1;
    game.winner_team_id = team1Wins ? team1 : team2;
    propagateWinner(game, byKey);
  }

  return games.map((game) => ({
    round: String(game.round ?? ""),
    slot: game.slot,
    team1_id: game.team1_id,
    team2_id: game.team2_id,
    winner_team_id: game.winner_team_id,
    status: game.status,
    team1_score: game.team1_score,
    team2_score: game.team2_score,
  })) as ScoringGame[];
}

function runWorldCupProjection(
  baseGames: GameRow[],
  teams: TeamRow[],
  soccerProbabilities: Map<string, SoccerMatchProbability>,
  teamStrengthById: Map<string, number>,
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
    if (String(game.round ?? "").toUpperCase() !== "GROUP") continue;
    if (!game.team1_id || !game.team2_id) continue;
    if (game.winner_team_id || isFinalDraw(game)) continue;

    const outcome = chooseSoccerOutcome(
      String(game.team1_id),
      String(game.team2_id),
      soccerProbabilities,
      teamStrengthById,
      chooseMostLikely,
    );
    setProjectedGroupResult(game, outcome);
  }

  const teamsByGroup = new Map<string, TeamRow[]>();
  for (const team of teams) {
    const group = groupCodeFromRegion(team.region);
    if (!group) continue;
    const groupTeams = teamsByGroup.get(group) ?? [];
    groupTeams.push(team);
    teamsByGroup.set(group, groupTeams);
  }

  const groupGamesByGroup = new Map<string, MutableGame[]>();
  for (const game of sorted) {
    if (String(game.round ?? "").toUpperCase() !== "GROUP") continue;
    const group = groupCodeFromRegion(game.region);
    if (!group) continue;
    const groupGames = groupGamesByGroup.get(group) ?? [];
    groupGames.push(game);
    groupGamesByGroup.set(group, groupGames);
  }

  const rankingsByGroup = new Map<string, WorldCupStanding[]>();
  for (const [group, groupTeams] of teamsByGroup) {
    const ranked = rankProjectedWorldCupGroup(group, groupTeams, groupGamesByGroup.get(group) ?? []);
    if (ranked.length > 0) rankingsByGroup.set(group, ranked);
  }

  for (const [label, target] of Object.entries(WORLD_CUP_FIXED_R32_SLOT_TARGETS)) {
    const rank = Number(label.slice(0, 1));
    const group = label.slice(1);
    const teamId = rankingsByGroup.get(group)?.find((row) => row.rank === rank)?.teamId ?? null;
    if (!teamId) continue;
    const game = byKey.get(gameKey("R32", null, target.slot));
    if (!game) continue;
    game[target.side] = teamId;
    if (game.winner_team_id && game.winner_team_id !== game.team1_id && game.winner_team_id !== game.team2_id) {
      game.winner_team_id = null;
    }
  }

  const thirdRows = [...rankingsByGroup.values()]
    .map((rows) => rows.find((row) => row.rank === 3))
    .filter((row): row is WorldCupStanding => row != null)
    .sort(compareWorldCupStandings);
  const qualifiedThirdGroups = thirdRows.slice(0, 8).map((row) => row.group);
  const thirdPlaceAssignments = resolveWorldCupThirdPlaceAssignments(qualifiedThirdGroups);
  if (thirdPlaceAssignments) {
    for (const [winnerSlot, group] of thirdPlaceAssignments) {
      const teamId = thirdRows.find((row) => row.group === group)?.teamId ?? null;
      const slotTarget = WORLD_CUP_THIRD_PLACE_R32_TARGETS[winnerSlot] ?? null;
      if (!teamId || !slotTarget) continue;
      const game = byKey.get(gameKey("R32", null, slotTarget.slot));
      if (!game) continue;
      game[slotTarget.side] = teamId;
      if (game.winner_team_id && game.winner_team_id !== game.team1_id && game.winner_team_id !== game.team2_id) {
        game.winner_team_id = null;
      }
    }
  }

  for (const game of sorted) {
    const round = String(game.round ?? "").toUpperCase();
    const gameRoundOrder = roundOrder(round);
    if (round === "GROUP" || gameRoundOrder === 0 || gameRoundOrder > maxRoundOrder) continue;

    if (game.winner_team_id) {
      propagateWorldCupWinner(game, byKey);
      continue;
    }

    if (!game.team1_id || !game.team2_id) continue;
    const probabilityTeam1 = knockoutProbabilityTeam1(
      String(game.team1_id),
      String(game.team2_id),
      soccerProbabilities,
      teamStrengthById,
    );
    const team1Wins = chooseMostLikely ? probabilityTeam1 >= 0.5 : Math.random() < probabilityTeam1;
    setProjectedKnockoutResult(game, team1Wins);
    propagateWorldCupWinner(game, byKey);
  }

  return games.map((game) => ({
    round: String(game.round ?? ""),
    slot: game.slot,
    team1_id: game.team1_id,
    team2_id: game.team2_id,
    winner_team_id: game.winner_team_id,
    status: game.status,
    team1_score: game.team1_score,
    team2_score: game.team2_score,
  })) as ScoringGame[];
}

async function requirePoolAccess(req: Request, poolId: string) {
  const token = getBearerToken(req);
  if (!token) {
    return { error: forecastJson({ error: "Missing authorization token." }, { status: 401 }) };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData.user) {
    return {
      error: forecastJson({ error: authErr?.message ?? "Unauthorized." }, { status: 401 }),
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
    return { error: forecastJson({ error: memberErr.message }, { status: 400 }) };
  }

  if (!memberRow) {
    return {
      error: forecastJson(
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
  for (let day = -SCOREBOARD_LOOKBACK_DAYS; day <= LOOKAHEAD_DAYS; day += SCOREBOARD_WINDOW_DAYS) {
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
  const liveScores: LiveOverlayScoreGame[] = [];
  for (const payload of scoreboardPayloads) {
    if (!payload) continue;
    for (const event of payload.events ?? []) {
      if (!isNcaaTournamentEvent(event)) continue;
      const id = String(event.id ?? "").trim();
      if (!id) continue;
      if (eventById.has(id)) continue;
      eventById.set(id, event);
      const liveScore = liveScoreFromEvent(event);
      if (liveScore) liveScores.push(liveScore);
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

  return { pairProbabilities, liveScores };
}

async function fetchWorldCupSoccerProbabilities(
  localTeamIdByEspnTeamId: Map<string, string>,
  teamStrengthById: Map<string, number>,
) {
  const dateRanges: string[] = [];
  for (let day = -SCOREBOARD_LOOKBACK_DAYS; day <= LOOKAHEAD_DAYS; day += SCOREBOARD_WINDOW_DAYS) {
    const endDay = Math.min(day + SCOREBOARD_WINDOW_DAYS - 1, LOOKAHEAD_DAYS);
    const start = toEtYyyymmdd(shiftDate(day));
    const end = toEtYyyymmdd(shiftDate(endDay));
    dateRanges.push(start === end ? start : `${start}-${end}`);
  }

  const scoreboardPayloads = await Promise.all(
    dateRanges.map(async (dateRange) => {
      const endpoint =
        `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateRange}&limit=500`;
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) return null;
      return (await response.json()) as EspnScoreboard;
    }),
  );

  const eventById = new Map<string, EspnEvent>();
  const liveScores: LiveOverlayScoreGame[] = [];
  for (const payload of scoreboardPayloads) {
    if (!payload) continue;
    for (const event of payload.events ?? []) {
      const id = String(event.id ?? "").trim();
      if (!id) continue;
      if (eventById.has(id)) continue;
      eventById.set(id, event);
      const liveScore = liveScoreFromEvent(event);
      if (liveScore) liveScores.push(liveScore);
    }
  }

  const soccerProbabilities = new Map<string, SoccerMatchProbability>();
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
        `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${encodeURIComponent(eventId)}`,
        { cache: "no-store" },
      ).catch(() => null);

      const summary =
        summaryResponse && summaryResponse.ok
          ? ((await summaryResponse.json()) as EspnSummary)
          : null;

      const state = String(event.status?.type?.state ?? "pre").toLowerCase();
      const probabilities = extractSoccerProbabilities(
        event,
        summary,
        state,
        String(home.team.id),
        String(away.team.id),
        teamStrengthById.get(homeLocal) ?? 12,
        teamStrengthById.get(awayLocal) ?? 12,
      );

      const key = pairKey(awayLocal, homeLocal);
      if (awayLocal < homeLocal) {
        soccerProbabilities.set(key, {
          team_a: awayLocal,
          team_b: homeLocal,
          win_a: probabilities.away,
          draw: probabilities.draw,
          win_b: probabilities.home,
          source: probabilities.source,
        });
      } else {
        soccerProbabilities.set(key, {
          team_a: homeLocal,
          team_b: awayLocal,
          win_a: probabilities.home,
          draw: probabilities.draw,
          win_b: probabilities.away,
          source: probabilities.source,
        });
      }
    }),
  );

  return { soccerProbabilities, liveScores };
}

function applyForecastLiveFinalOverlay(
  games: GameRow[],
  teams: TeamRow[],
  liveScores: LiveOverlayScoreGame[],
) {
  if (liveScores.length === 0) return games;

  const overlayGames = games.map((game) => ({
    id: game.id,
    round: String(game.round ?? ""),
    region: game.region ?? null,
    slot: Number(game.slot ?? 0),
    status: game.status,
    team1_id: game.team1_id,
    team2_id: game.team2_id,
    winner_team_id: game.winner_team_id,
    team1_score: game.team1_score,
    team2_score: game.team2_score,
  }));
  const liveByGameId = matchLiveScoresToGames(overlayGames, teams, liveScores);

  return games.map((game) => {
    const live = liveByGameId.get(game.id);
    if (!live || live.state !== "FINAL") return game;
    if (typeof live.team1Score !== "number" || typeof live.team2Score !== "number") return game;

    const next: GameRow = {
      ...game,
      status: "Final",
      team1_score: live.team1Score,
      team2_score: live.team2Score,
    };
    if (live.team1Score === live.team2Score) {
      next.winner_team_id = null;
    } else if (game.team1_id && game.team2_id) {
      next.winner_team_id = live.team1Score > live.team2Score ? game.team1_id : game.team2_id;
    }
    return next;
  });
}

function collectActiveTeamIds(games: GameRow[], teams: TeamRow[], competitionSlug: CompetitionSlug) {
  const eliminatedTeamIds = getEliminatedTeamIds(
    games.map((game) => ({
      round: String(game.round ?? ""),
      slot: game.slot,
      team1_id: game.team1_id,
      team2_id: game.team2_id,
      winner_team_id: game.winner_team_id,
      status: game.status,
      team1_score: game.team1_score,
      team2_score: game.team2_score,
    })),
    competitionSlug,
  );
  const activeTeamIds = new Set<string>();
  for (const game of games) {
    const hasWinner = Boolean(game.winner_team_id);
    const isGroupDraw = isFinalDraw(game);
    if (hasWinner || isGroupDraw) continue;
    if (game.team1_id && !eliminatedTeamIds.has(game.team1_id)) activeTeamIds.add(String(game.team1_id));
    if (game.team2_id && !eliminatedTeamIds.has(game.team2_id)) activeTeamIds.add(String(game.team2_id));
  }

  if (competitionSlug === "world-cup") {
    const groupHasUnresolvedGame = new Set<string>();
    for (const game of games) {
      if (String(game.round ?? "").toUpperCase() !== "GROUP") continue;
      if (game.winner_team_id || isFinalDraw(game)) continue;
      const group = groupCodeFromRegion(game.region);
      if (group) groupHasUnresolvedGame.add(group);
    }

    for (const team of teams) {
      const group = groupCodeFromRegion(team.region);
      if (group && groupHasUnresolvedGame.has(group) && !eliminatedTeamIds.has(String(team.id))) {
        activeTeamIds.add(String(team.id));
      }
    }
  }

  return activeTeamIds;
}

function normalizeKnownAdvancements(games: GameRow[], competitionSlug: string): GameRow[] {
  const normalized = cloneGames(games);
  const sorted = sortedGamesForSimulation(normalized);
  const byKey = new Map<string, MutableGame>();

  for (const game of sorted) {
    const round = String(game.round ?? "").toUpperCase();
    const slot = Number(game.slot);
    if (!round || !Number.isFinite(slot) || slot < 1) continue;
    byKey.set(gameKey(round, game.region ?? null, Math.trunc(slot)), game);
  }

  for (const game of sorted) {
    if (!game.winner_team_id) continue;
    if (competitionSlug === "world-cup") {
      propagateWorldCupWinner(game, byKey);
    } else {
      propagateWinner(game, byKey);
    }
  }

  return normalized;
}

export async function GET(req: Request) {
  try {
    const poolId = new URL(req.url).searchParams.get("poolId")?.trim() ?? "";
    if (!poolId) {
      return forecastJson({ error: "poolId is required." }, { status: 400 });
    }

    const access = await requirePoolAccess(req, poolId);
    if ("error" in access) return access.error;

    const supabaseAdmin = getSupabaseAdmin();
    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("competition_slug")
      .eq("id", poolId)
      .single();
    if (poolErr) {
      return forecastJson({ error: poolErr.message }, { status: 400 });
    }
    const competitionSlug = normalizeCompetitionSlug(poolRow?.competition_slug);
    const latestEntries = await loadLatestPoolEntries(supabaseAdmin, poolId, competitionSlug);
    const baseRows = latestEntries.entries;

    if (baseRows.length === 0) {
      return forecastJson({
        ok: true,
        generated_at: new Date().toISOString(),
        horizon: "round",
        horizon_round: "CHIP",
        entries: [],
      });
    }

    const entryIds = baseRows.map((row) => row.entry_id);
    const forecastTeamsBase = supabaseAdmin.from("teams").select("id,name,region,seed_in_region,cost,espn_team_id");
    const forecastGamesBase = supabaseAdmin
      .from("games")
      .select("id,round,region,slot,team1_id,team2_id,winner_team_id,status,team1_score,team2_score");
    const [teamsResult, gamesResult] = await Promise.all([
      competitionSlug === "world-cup"
        ? forecastTeamsBase.eq("competition_slug", "world-cup")
        : forecastTeamsBase.or("competition_slug.eq.march-madness,competition_slug.is.null"),
      competitionSlug === "world-cup"
        ? forecastGamesBase.eq("competition_slug", "world-cup")
        : forecastGamesBase.or("competition_slug.eq.march-madness,competition_slug.is.null"),
    ]);

    if (teamsResult.error) {
      return forecastJson({ error: teamsResult.error.message }, { status: 400 });
    }
    if (gamesResult.error) {
      return forecastJson({ error: gamesResult.error.message }, { status: 400 });
    }

    const teams =
      competitionSlug === "world-cup"
        ? ((teamsResult.data ?? []) as TeamRow[]).map((team) => withWorldCupDraftCost(team))
        : ((teamsResult.data ?? []) as TeamRow[]);
    const games = ((gamesResult.data ?? []) as GameRow[]).map((game) => ({
      ...game,
      id: String(game.id),
    }));

    const picksByEntry = latestEntries.picksByEntry;
    for (const entryId of entryIds) picksByEntry.set(entryId, picksByEntry.get(entryId) ?? []);

    const teamSeedById = new Map<string, number | null>();
    const teamCostById = new Map<string, number | null>();
    const teamStrengthById = new Map<string, number>();
    const localTeamIdByEspnTeamId = new Map<string, string>();
    for (const team of teams) {
      const teamId = String(team.id);
      teamSeedById.set(teamId, team.seed_in_region ?? null);
      teamCostById.set(teamId, team.cost ?? null);
      teamStrengthById.set(teamId, teamStrengthFromCost(team.cost ?? null));
      if (team.espn_team_id != null) {
        localTeamIdByEspnTeamId.set(String(team.espn_team_id), teamId);
      }
    }

    const probabilityData =
      competitionSlug === "world-cup"
        ? {
            pairProbabilities: new Map<string, PairProbability>(),
            ...(await fetchWorldCupSoccerProbabilities(localTeamIdByEspnTeamId, teamStrengthById)),
          }
        : {
            soccerProbabilities: new Map<string, SoccerMatchProbability>(),
            ...(await fetchPairProbabilities(localTeamIdByEspnTeamId)),
          };
    const pairProbabilities = probabilityData.pairProbabilities ?? new Map<string, PairProbability>();
    const soccerProbabilities = probabilityData.soccerProbabilities ?? new Map<string, SoccerMatchProbability>();
    const liveScores = probabilityData.liveScores ?? [];
    const gamesWithLiveFinals = applyForecastLiveFinalOverlay(games, teams, liveScores);
    const gamesWithOfficialResults =
      competitionSlug === "world-cup"
        ? (applyWorldCupManualResultOverrides(gamesWithLiveFinals) as GameRow[])
        : gamesWithLiveFinals;

    const horizonRound = resolveForecastHorizonRound(gamesWithOfficialResults);
    const horizonRoundOrder = ROUND_ORDER[horizonRound] ?? ROUND_ORDER.CHIP;
    const scopedGames = normalizeKnownAdvancements(
      gamesWithOfficialResults.filter(
        (game) => roundOrder(game.round) > 0 && roundOrder(game.round) <= horizonRoundOrder,
      ),
      competitionSlug,
    );

    const currentScoringGames = scopedGames.map((game) => ({
      round: String(game.round ?? ""),
      slot: game.slot,
      team1_id: game.team1_id,
      team2_id: game.team2_id,
      winner_team_id: game.winner_team_id,
      status: game.status,
      team1_score: game.team1_score,
      team2_score: game.team2_score,
    })) as ScoringGame[];

    const scoringOptions = { competitionSlug, teamCostById };
    const currentScores = scoreEntries(currentScoringGames, teamSeedById, picksByEntry, scoringOptions);
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
    const activeTeamIds = collectActiveTeamIds(scopedGames, teams, competitionSlug);
    const remainingTeamIdsByEntryId = new Map<string, Set<string>>();
    for (const entryId of entryIds) {
      remainingTeamIdsByEntryId.set(
        entryId,
        new Set((picksByEntry.get(entryId) ?? []).filter((teamId) => activeTeamIds.has(teamId))),
      );
    }

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
      const projectedGames =
        competitionSlug === "world-cup"
          ? runWorldCupProjection(
              scopedGames,
              teams,
              soccerProbabilities,
              teamStrengthById,
              false,
              horizonRoundOrder,
            )
          : runBracketProjection(
              scopedGames,
              pairProbabilities,
              teamSeedById,
              false,
              horizonRoundOrder,
            );
      const projectedScores = scoreEntries(projectedGames, teamSeedById, picksByEntry, scoringOptions);

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

    const mostLikelyGames =
      competitionSlug === "world-cup"
        ? runWorldCupProjection(
            scopedGames,
            teams,
            soccerProbabilities,
            teamStrengthById,
            true,
            horizonRoundOrder,
          )
        : runBracketProjection(
            scopedGames,
            pairProbabilities,
            teamSeedById,
            true,
            horizonRoundOrder,
          );
    const mostLikelyScores = scoreEntries(mostLikelyGames, teamSeedById, picksByEntry, scoringOptions);
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
        const firstPlaceProbability = isFirstPlaceDominated(
          entryId,
          currentScoreByEntryId,
          remainingTeamIdsByEntryId,
        )
          ? 0
          : Number((((firstPlaceCountByEntry.get(entryId) ?? 0) / runs) * 100).toFixed(1));

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
          first_place_probability: firstPlaceProbability,
        };
      })
      .sort(
        (a, b) =>
          a.expected_rank - b.expected_rank ||
          b.expected_score - a.expected_score ||
          a.entry_id.localeCompare(b.entry_id),
      );

    return forecastJson({
      ok: true,
      generated_at: new Date().toISOString(),
      horizon: "round",
      horizon_round: horizonRound,
      monte_carlo_runs: runs,
      unresolved_game_count: unresolvedGameCount,
      pair_probability_count: competitionSlug === "world-cup" ? soccerProbabilities.size : pairProbabilities.size,
      entries,
    });
  } catch (error: unknown) {
    return forecastJson(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
