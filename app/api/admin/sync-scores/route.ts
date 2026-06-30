import { NextResponse } from "next/server";
import { requireSiteAdminOrCron } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { sendPoolFinalUpdateNotifications, type ChangedWinnerGame } from "@/lib/pushCampaigns";
import {
  WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT,
  WORLD_CUP_REFERENCE_R32_MATCHUPS,
  type WorldCupPropagationTarget,
} from "@/lib/worldCupBracket";
import { normalizeWorldCupTeamKey } from "@/lib/worldCupTeamAliases";

const KEY = process.env.SPORTS_DATA_IO_KEY ?? process.env.SPORTSDATAIO_KEY;
const BASE = "https://api.sportsdata.io";
const DEFAULT_LOOKBACK_DAYS = 3;

type SportsGame = {
  Status?: string;
  GameID?: number;
  HomeTeamID?: number;
  AwayTeamID?: number;
  HomeTeamScore?: number | null;
  AwayTeamScore?: number | null;
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
  team?: EspnTeam;
};

type EspnCompetition = {
  competitors?: EspnCompetitor[];
  tournamentId?: number | string;
  notes?: Array<{ headline?: string }>;
  headlines?: Array<{ shortLinkText?: string; description?: string }>;
};

type EspnEvent = {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: EspnCompetition[];
  status?: {
    type?: {
      state?: string;
      completed?: boolean;
    };
  };
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

type FinalGame = {
  gameId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
};

type LocalBracketGame = {
  id: string;
  round: string | null;
  region: string | null;
  slot: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  competition_slug?: string | null;
  status?: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
};

type FinalsApplyResult = {
  finalsSeen: number;
  updatedGames: number;
  alreadySet: number;
  skippedUnlinked: number;
  skippedNoTeamMap: number;
  skippedTie: number;
  relinkedByTeamPair: number;
  skippedPairNoMatch: number;
  skippedPairAmbiguous: number;
  skippedWinnerNotInGame: number;
  playInSlotsUpdated?: number;
  playInGamesTouched?: number;
  advancedSlotsUpdated: number;
  advancedGamesTouched: number;
  clearedInvalidWinners: number;
  clearedInvalidSourceWinners: number;
  changedGames: ChangedWinnerGame[];
};

type TeamIdentityRow = {
  id: string;
  name?: string | null;
  region?: string | null;
  seed?: number | null;
  seed_in_region?: number | null;
  sportsdata_team_id?: number | null;
  espn_team_id?: number | null;
};

type LocalPairGame = {
  id: string;
  round?: string | null;
  region?: string | null;
  slot?: number | null;
  status?: string | null;
  start_time?: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  competition_slug?: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
};

const PLAY_IN_R64_SLOT_KEYS = new Set([
  "south|1",
  "west|5",
  "midwest|1",
  "midwest|5",
]);

// YYYY-MM-DD (SportsDataIO expects this for BoxScoresByDate)
function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function yyyymmdd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function shiftDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

function teamPairKey(teamA: string, teamB: string) {
  return teamA < teamB ? `${teamA}|${teamB}` : `${teamB}|${teamA}`;
}

function toSeed(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const seed = Math.trunc(n);
  return seed >= 1 && seed <= 16 ? seed : null;
}

function teamIdentityScore(row: TeamIdentityRow): number {
  const name = norm(row.name);
  let score = 0;
  if (name && !name.includes("winner")) score += 2;
  if (row.region) score += 5;
  if (toSeed(row.seed_in_region) != null) score += 5;
  if (toSeed(row.seed) != null) score += 2;
  return score;
}

function preferredLocalIdsForExternalTeam(rows: TeamIdentityRow[]): string[] {
  return [...rows]
    .sort((a, b) => {
      const scoreDiff = teamIdentityScore(b) - teamIdentityScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const seedDiff = (toSeed(a.seed_in_region) ?? 99) - (toSeed(b.seed_in_region) ?? 99);
      if (seedDiff !== 0) return seedDiff;
      return String(a.id).localeCompare(String(b.id));
    })
    .map((row) => String(row.id));
}

function addTeamIdentity(map: Map<string, TeamIdentityRow[]>, key: string, row: TeamIdentityRow) {
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(row);
  map.set(key, list);
}

function preferredWorldCupLocalIds(
  localTeamsByEspn: Map<number, TeamIdentityRow[]>,
  localTeamsByName: Map<string, TeamIdentityRow[]>,
  espnTeamId: number,
  teamName: string | null | undefined,
) {
  const byEspn = localTeamsByEspn.get(espnTeamId) ?? [];
  if (byEspn.length > 0) return preferredLocalIdsForExternalTeam(byEspn);

  const nameKey = normalizeWorldCupTeamKey(teamName);
  return preferredLocalIdsForExternalTeam(localTeamsByName.get(nameKey) ?? []);
}

function roundOrder(round: string | null | undefined): number {
  const key = String(round ?? "").toUpperCase();
  if (key === "R64") return 1;
  if (key === "R32") return 2;
  if (key === "S16") return 3;
  if (key === "E8") return 4;
  if (key === "F4") return 5;
  if (key === "CHIP") return 6;
  return 0;
}

function localPairGameScore(game: LocalPairGame): number {
  let score = 0;
  score += roundOrder(game.round) * 10;
  if (Number.isFinite(Number(game.slot))) score += 2;
  if (!game.winner_team_id) score += 4;
  const status = norm(game.status);
  if (status && !status.startsWith("final")) score += 1;
  const startMs = game.start_time ? Date.parse(game.start_time) : Number.NaN;
  if (Number.isFinite(startMs)) score += Math.trunc(startMs / 60000);
  return score;
}

function chooseBestMatchingGame(matches: LocalPairGame[]): LocalPairGame | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const ranked = [...matches].sort((a, b) => {
    const scoreDiff = localPairGameScore(b) - localPairGameScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    const roundDiff = roundOrder(String(b.round ?? "")) - roundOrder(String(a.round ?? ""));
    if (roundDiff !== 0) return roundDiff;
    const slotDiff = Number(a.slot ?? 0) - Number(b.slot ?? 0);
    if (slotDiff !== 0) return slotDiff;
    return String(a.id).localeCompare(String(b.id));
  });
  return ranked[0] ?? null;
}

function isMissingColumnError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function isSportsDataQuotaError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("out of call volume quota") || msg.includes("quota");
}

function toSeason(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const year = Math.trunc(n);
  if (year < 2000 || year > 2100) return null;
  return year;
}

function espnTeamName(team: EspnTeam | undefined): string | null {
  return (
    team?.location?.trim() ||
    team?.shortDisplayName?.trim() ||
    team?.displayName?.trim() ||
    team?.name?.trim() ||
    null
  );
}

function addWorldCupTeamLookups(
  row: TeamIdentityRow,
  localTeamsByEspn: Map<number, TeamIdentityRow[]>,
  localTeamsByName: Map<string, TeamIdentityRow[]>,
) {
  const espnId = Number(row.espn_team_id);
  if (Number.isFinite(espnId)) {
    const key = Math.trunc(espnId);
    const list = localTeamsByEspn.get(key) ?? [];
    list.push(row);
    localTeamsByEspn.set(key, list);
  }

  addTeamIdentity(localTeamsByName, normalizeWorldCupTeamKey(row.name), row);
}

function isNcaaTournamentEvent(event: EspnEvent) {
  const comp = event.competitions?.[0];
  if (!comp) return false;

  const excludedPhrases = [
    "nit",
    "national invitation tournament",
    "college basketball crown",
    "cbi",
    "college basketball invitational",
    "the crown",
  ];

  const tournamentId = Number(comp.tournamentId);
  if (Number.isFinite(tournamentId)) {
    return tournamentId === 22;
  }

  const notesText = (comp.notes ?? [])
    .map((n) => n.headline ?? "")
    .join(" ")
    .toLowerCase();

  const headlineText = (comp.headlines ?? [])
    .map((h) => `${h.shortLinkText ?? ""} ${h.description ?? ""}`)
    .join(" ")
    .toLowerCase();

  const eventText = `${event.name ?? ""} ${event.shortName ?? ""}`.toLowerCase();
  const combined = `${notesText} ${headlineText} ${eventText}`;
  if (excludedPhrases.some((phrase) => combined.includes(phrase))) return false;

  if (combined.includes("men's basketball championship")) return true;
  if (combined.includes("mens basketball championship")) return true;
  if (combined.includes("ncaa tournament")) return true;
  if (combined.includes("ncaa men's tournament")) return true;
  if (combined.includes("march madness")) return true;

  return false;
}

function collectFinalGames(games: SportsGame[]): FinalGame[] {
  const finals: FinalGame[] = [];

  for (const g of games ?? []) {
    const status = norm(g?.Status);
    if (!status.startsWith("final")) continue;

    const gameId = Number(g?.GameID);
    const homeTeamId = Number(g?.HomeTeamID);
    const awayTeamId = Number(g?.AwayTeamID);
    const homeScore = g?.HomeTeamScore;
    const awayScore = g?.AwayTeamScore;

    if (
      !Number.isFinite(gameId) ||
      !Number.isFinite(homeTeamId) ||
      !Number.isFinite(awayTeamId) ||
      typeof homeScore !== "number" ||
      typeof awayScore !== "number"
    ) {
      continue;
    }

    finals.push({
      gameId,
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
    });
  }

  return finals;
}

function gameKey(
  competitionSlug: string | null | undefined,
  round: string,
  region: string | null,
  slot: number,
): string {
  const prefix = `${norm(competitionSlug) || "march-madness"}|`;
  if (round === "R64" || round === "R32" || round === "S16" || round === "E8") {
    return `${prefix}${round}|${norm(region)}|${slot}`;
  }
  return `${prefix}${round}|${slot}`;
}

function nextTargetForWinner(g: LocalBracketGame): WorldCupPropagationTarget | null {
  const round = String(g.round ?? "").toUpperCase();
  const slot = Number(g.slot);
  if (!Number.isFinite(slot) || slot < 1) return null;

  if (g.competition_slug === "world-cup") {
    const mapped = WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[`${round}|${Math.trunc(slot)}`];
    if (mapped) return mapped;
  }

  if (round === "R64" || round === "R32" || round === "S16") {
    const nextRound = round === "R64" ? "R32" : round === "R32" ? "S16" : "E8";
    return {
      round: nextRound,
      region: g.region ?? null,
      slot: Math.ceil(slot / 2),
      side: slot % 2 === 1 ? "team1_id" : "team2_id",
    };
  }

  if (round === "E8") {
    const region = norm(g.region);
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

async function hasStatusColumn(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  const { error } = await supabaseAdmin.from("games").select("id,status").limit(1);
  if (!error) return true;
  if (isMissingColumnError(String(error.message ?? ""))) return false;
  throw error;
}

async function fetchGamesForPairMatching(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  includeSportsDataId: boolean,
) {
  const baseFields = [
    "id",
    "round",
    "region",
    "slot",
    "start_time",
    "team1_id",
    "team2_id",
    "winner_team_id",
    "competition_slug",
    "team1_score",
    "team2_score",
  ];
  if (includeSportsDataId) baseFields.push("sportsdata_game_id");

  const withStatusFields = [...baseFields, "status"].join(",");
  const fallbackFields = baseFields.join(",");

  const withStatus = await supabaseAdmin.from("games").select(withStatusFields);
  if (!withStatus.error) {
    return ((withStatus.data ?? []) as unknown[]) as Array<Record<string, unknown>>;
  }
  if (!isMissingColumnError(String(withStatus.error.message ?? ""))) {
    throw withStatus.error;
  }

  const fallback = await supabaseAdmin.from("games").select(fallbackFields);
  if (fallback.error) throw fallback.error;
  return (((fallback.data ?? []) as unknown[]) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    status: null,
  }));
}

async function propagateWinnersToNextRounds(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, nowIso: string) {
  const { data: allGames, error: gamesErr } = await supabaseAdmin
    .from("games")
    .select("id,round,region,slot,team1_id,team2_id,winner_team_id,competition_slug");
  if (gamesErr) throw gamesErr;

  const games = ((allGames ?? []) as LocalBracketGame[]).map((g) => ({
    ...g,
    id: String(g.id),
  }));

  const byKey = new Map<string, LocalBracketGame>();
  for (const g of games) {
    const round = String(g.round ?? "").toUpperCase();
    const slot = Number(g.slot);
    if (!Number.isFinite(slot) || slot < 1 || !round) continue;
    byKey.set(gameKey(g.competition_slug, round, g.region ?? null, Math.trunc(slot)), g);
  }

  const order: Record<string, number> = { R64: 1, R32: 2, S16: 3, E8: 4, F4: 5, CHIP: 6 };
  const sorted = [...games].sort((a, b) => {
    const ao = order[String(a.round ?? "").toUpperCase()] ?? 99;
    const bo = order[String(b.round ?? "").toUpperCase()] ?? 99;
    if (ao !== bo) return ao - bo;
    const ar = String(a.region ?? "");
    const br = String(b.region ?? "");
    if (ar !== br) return ar.localeCompare(br);
    return Number(a.slot ?? 0) - Number(b.slot ?? 0);
  });

  let advancedSlotsUpdated = 0;
  let advancedGamesTouched = 0;
  let clearedInvalidWinners = 0;
  let clearedInvalidSourceWinners = 0;
  const touchedGameIds = new Set<string>();

  for (const source of sorted) {
    const sourceTeam1 = source.team1_id ? String(source.team1_id) : null;
    const sourceTeam2 = source.team2_id ? String(source.team2_id) : null;
    let winnerId = source.winner_team_id ? String(source.winner_team_id) : null;
    if (winnerId && winnerId !== sourceTeam1 && winnerId !== sourceTeam2) {
      const { error: clearSourceErr } = await supabaseAdmin
        .from("games")
        .update({ winner_team_id: null, last_synced_at: nowIso })
        .eq("id", source.id);
      if (clearSourceErr) throw clearSourceErr;
      source.winner_team_id = null;
      winnerId = null;
      clearedInvalidSourceWinners++;
    }

    const targetRef = nextTargetForWinner(source);
    if (!targetRef) continue;

    const target = byKey.get(gameKey(source.competition_slug, targetRef.round, targetRef.region, targetRef.slot));
    if (!target) continue;

    const updatePayload: Record<string, unknown> = { last_synced_at: nowIso };
    if (targetRef.side === "team1_id" && (target.team1_id ? String(target.team1_id) : null) !== winnerId) {
      updatePayload.team1_id = winnerId;
      advancedSlotsUpdated++;
    }
    if (targetRef.side === "team2_id" && (target.team2_id ? String(target.team2_id) : null) !== winnerId) {
      updatePayload.team2_id = winnerId;
      advancedSlotsUpdated++;
    }

    const nextTeam1 = targetRef.side === "team1_id" ? winnerId : (target.team1_id ? String(target.team1_id) : null);
    const nextTeam2 = targetRef.side === "team2_id" ? winnerId : (target.team2_id ? String(target.team2_id) : null);

    const existingWinner = target.winner_team_id ? String(target.winner_team_id) : null;
    if (existingWinner && existingWinner !== nextTeam1 && existingWinner !== nextTeam2) {
      updatePayload.winner_team_id = null;
      clearedInvalidWinners++;
    }

    if (Object.keys(updatePayload).length <= 1) continue;

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update(updatePayload)
      .eq("id", target.id);
    if (updErr) throw updErr;

    if ("team1_id" in updatePayload) {
      const value = updatePayload.team1_id;
      target.team1_id = value == null ? null : String(value);
    }
    if ("team2_id" in updatePayload) {
      const value = updatePayload.team2_id;
      target.team2_id = value == null ? null : String(value);
    }
    if ("winner_team_id" in updatePayload) target.winner_team_id = null;

    touchedGameIds.add(target.id);
  }

  advancedGamesTouched = touchedGameIds.size;
  return {
    advancedSlotsUpdated,
    advancedGamesTouched,
    clearedInvalidWinners,
    clearedInvalidSourceWinners,
  };
}

async function updateR32Slot(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  nowIso: string,
  gamesBySlot: Map<number, LocalBracketGame>,
  slot: number,
  side: "team1_id" | "team2_id",
  teamId: string | null,
) {
  const game = gamesBySlot.get(slot);
  if (!game) return 0;
  if ((game[side] ? String(game[side]) : null) === teamId) return 0;

  const updatePayload: Record<string, unknown> = {
    [side]: teamId,
    last_synced_at: nowIso,
  };
  const nextTeam1 = side === "team1_id" ? teamId : game.team1_id;
  const nextTeam2 = side === "team2_id" ? teamId : game.team2_id;
  const existingWinner = game.winner_team_id ? String(game.winner_team_id) : null;
  if (existingWinner && existingWinner !== nextTeam1 && existingWinner !== nextTeam2) {
    updatePayload.winner_team_id = null;
  }

  const { error } = await supabaseAdmin.from("games").update(updatePayload).eq("id", game.id);
  if (error) throw error;

  game[side] = teamId;
  if ("winner_team_id" in updatePayload) game.winner_team_id = null;
  return 1;
}

async function applyWorldCupReferenceBracketToR32(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  nowIso: string,
) {
  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id,name")
    .eq("competition_slug", "world-cup");
  if (teamErr) throw teamErr;

  const teamIdByName = new Map(
    ((teamRows ?? []) as Array<{ id: string; name: string | null }>).map((team) => [
      norm(team.name),
      String(team.id),
    ]),
  );

  const { data: gameRows, error: gameErr } = await supabaseAdmin
    .from("games")
    .select("id,round,slot,team1_id,team2_id,winner_team_id")
    .eq("competition_slug", "world-cup")
    .eq("round", "R32");
  if (gameErr) throw gameErr;

  const gamesBySlot = new Map<number, LocalBracketGame>();
  for (const game of (gameRows ?? []) as LocalBracketGame[]) {
    const slot = Number(game.slot);
    if (Number.isFinite(slot)) {
      gamesBySlot.set(Math.trunc(slot), {
        ...game,
        id: String(game.id),
        team1_id: game.team1_id ? String(game.team1_id) : null,
        team2_id: game.team2_id ? String(game.team2_id) : null,
        winner_team_id: game.winner_team_id ? String(game.winner_team_id) : null,
      });
    }
  }

  let bracketSlotsUpdated = 0;
  for (const [index, [team1Name, team2Name]] of WORLD_CUP_REFERENCE_R32_MATCHUPS.entries()) {
    const slot = index + 1;
    const team1Id = teamIdByName.get(norm(team1Name)) ?? null;
    const team2Id = teamIdByName.get(norm(team2Name)) ?? null;
    if (!team1Id || !team2Id) continue;
    bracketSlotsUpdated += await updateR32Slot(supabaseAdmin, nowIso, gamesBySlot, slot, "team1_id", team1Id);
    bracketSlotsUpdated += await updateR32Slot(supabaseAdmin, nowIso, gamesBySlot, slot, "team2_id", team2Id);
  }

  return {
    groupsResolved: 0,
    groupSlotsUpdated: bracketSlotsUpdated,
    thirdPlaceSlotsUpdated: 0,
    thirdPlaceAssignmentsResolved: false,
  };
}

async function applyPlayInWinnersToR64Slots(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  nowIso: string
) {
  const { data: r64Rows, error: r64Err } = await supabaseAdmin
    .from("games")
    .select("id,region,slot,team1_id,team2_id,winner_team_id")
    .eq("round", "R64");
  if (r64Err) throw r64Err;

  let playInSlotsResolved = 0;
  for (const row of (r64Rows ?? []) as LocalBracketGame[]) {
    const slot = Number(row.slot);
    if (!Number.isFinite(slot) || slot < 1) continue;
    const key = `${norm(row.region)}|${Math.trunc(slot)}`;
    if (!PLAY_IN_R64_SLOT_KEYS.has(key)) continue;

    const winnerId = row.winner_team_id ? String(row.winner_team_id) : null;
    const team1Id = row.team1_id ? String(row.team1_id) : null;
    const team2Id = row.team2_id ? String(row.team2_id) : null;
    if (!winnerId) continue;

    // Play-in final mapped onto an R64 row: swap the placeholder team to the
    // real winner and clear this temporary winner before normal propagation.
    if (winnerId === team1Id || winnerId === team2Id) continue;

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update({
        team2_id: winnerId,
        winner_team_id: null,
        last_synced_at: nowIso,
      })
      .eq("id", String(row.id));
    if (updErr) throw updErr;
    playInSlotsResolved++;
  }

  return { playInSlotsResolved };
}

async function fetchGamesByDateFinal(date: string): Promise<SportsGame[]> {
  const url = `${BASE}/v3/cbb/scores/json/GamesByDateFinal/${date}?key=${encodeURIComponent(KEY ?? "")}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SportsDataIO error ${res.status} for ${date}: ${txt}`);
  }

  const json = await res.json();
  return Array.isArray(json) ? (json as SportsGame[]) : [];
}

async function fetchTournamentGames(season: number): Promise<SportsGame[]> {
  const url = `${BASE}/v3/cbb/scores/json/Tournament/${season}?key=${encodeURIComponent(KEY ?? "")}`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SportsDataIO error ${res.status} for season ${season}: ${txt}`);
  }

  const raw = await res.json();
  if (Array.isArray(raw)) return raw as SportsGame[];
  if (Array.isArray(raw?.Games)) return raw.Games as SportsGame[];
  if (Array.isArray(raw?.games)) return raw.games as SportsGame[];
  return [];
}

async function fetchEspnFinalGames(lookbackDays: number): Promise<FinalGame[]> {
  const dateKeys: string[] = [];
  for (let day = -lookbackDays; day <= 0; day++) {
    dateKeys.push(yyyymmdd(shiftDate(day)));
  }

  const payloads = await Promise.all(
    dateKeys.map(async (dateKey) => {
      const endpoint =
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateKey}&groups=50&limit=500`;
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ESPN error ${res.status} (${dateKey}): ${text}`);
      }
      return (await res.json()) as EspnScoreboard;
    })
  );

  const finals: FinalGame[] = [];
  const seenEventIds = new Set<string>();

  for (const payload of payloads) {
    for (const event of payload.events ?? []) {
      if (!isNcaaTournamentEvent(event)) continue;

      const eventId = String(event.id ?? "").trim();
      if (eventId && seenEventIds.has(eventId)) continue;
      if (eventId) seenEventIds.add(eventId);

      const isFinal =
        norm(event.status?.type?.state) === "post" ||
        event.status?.type?.completed === true;
      if (!isFinal) continue;

      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const homeTeamId = Number(home.team?.id);
      const awayTeamId = Number(away.team?.id);
      const homeScore = Number(home.score);
      const awayScore = Number(away.score);
      if (!Number.isFinite(homeTeamId) || !Number.isFinite(awayTeamId)) continue;
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

      finals.push({
        gameId: eventId && /^\d+$/.test(eventId) ? Number(eventId) : -(finals.length + 1),
        homeTeamId: Math.trunc(homeTeamId),
        awayTeamId: Math.trunc(awayTeamId),
        homeScore: homeScore,
        awayScore: awayScore,
      });
    }
  }

  return finals;
}

async function fetchEspnWorldCupFinalGames(lookbackDays: number): Promise<FinalGame[]> {
  const dateKeys: string[] = [];
  for (let day = -lookbackDays; day <= 0; day++) {
    dateKeys.push(yyyymmdd(shiftDate(day)));
  }

  const payloads = await Promise.all(
    dateKeys.map(async (dateKey) => {
      const endpoint = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dateKey}&limit=500`;
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ESPN World Cup error ${res.status} (${dateKey}): ${text}`);
      }
      return (await res.json()) as EspnScoreboard;
    })
  );

  const finals: FinalGame[] = [];
  const seenEventIds = new Set<string>();

  for (const payload of payloads) {
    for (const event of payload.events ?? []) {
      const eventId = String(event.id ?? "").trim();
      if (eventId && seenEventIds.has(eventId)) continue;
      if (eventId) seenEventIds.add(eventId);

      const isFinal =
        norm(event.status?.type?.state) === "post" ||
        event.status?.type?.completed === true;
      if (!isFinal) continue;

      const competitors = event.competitions?.[0]?.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const homeTeamId = Number(home.team?.id);
      const awayTeamId = Number(away.team?.id);
      const homeScore = Number(home.score);
      const awayScore = Number(away.score);
      if (!Number.isFinite(homeTeamId) || !Number.isFinite(awayTeamId)) continue;
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

      finals.push({
        gameId: eventId && /^\d+$/.test(eventId) ? Number(eventId) : -(finals.length + 1),
        homeTeamId: Math.trunc(homeTeamId),
        awayTeamId: Math.trunc(awayTeamId),
        homeScore,
        awayScore,
        homeTeamName: espnTeamName(home.team),
        awayTeamName: espnTeamName(away.team),
      });
    }
  }

  return finals;
}

async function applyEspnFinalsToLocalGames(finals: FinalGame[]) {
  const supabaseAdmin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const canWriteStatus = await hasStatusColumn(supabaseAdmin);

  if (finals.length === 0) {
    return {
      espnFinalsSeen: 0,
      espnUpdatedGames: 0,
      espnAlreadySet: 0,
      espnSkippedNoTeamMap: 0,
      espnSkippedPairNoMatch: 0,
      espnSkippedPairAmbiguous: 0,
      espnSkippedTie: 0,
      espnAdvancedSlotsUpdated: 0,
      espnAdvancedGamesTouched: 0,
      espnClearedInvalidWinners: 0,
      espnClearedInvalidSourceWinners: 0,
    };
  }

  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id,name,region,seed,seed_in_region,espn_team_id")
    .not("espn_team_id", "is", null);
  if (teamErr) throw teamErr;

  const localTeamsByEspn = new Map<number, TeamIdentityRow[]>();
  for (const t of (teamRows ?? []) as TeamIdentityRow[]) {
    const espnId = Number(t.espn_team_id);
    if (!Number.isFinite(espnId)) continue;
    const key = Math.trunc(espnId);
    const list = localTeamsByEspn.get(key) ?? [];
    list.push(t);
    localTeamsByEspn.set(key, list);
  }

  const gameRows = await fetchGamesForPairMatching(supabaseAdmin, false);
  const gamesByPair = new Map<string, LocalPairGame[]>();
  for (const g of gameRows as LocalPairGame[]) {
    if (!g.team1_id || !g.team2_id) continue;
    const key = teamPairKey(String(g.team1_id), String(g.team2_id));
    const bucket = gamesByPair.get(key) ?? [];
    bucket.push({
      id: String(g.id),
      round: g.round ?? null,
      region: g.region ?? null,
      slot: g.slot ?? null,
      status: g.status ?? null,
      start_time: g.start_time ?? null,
      team1_id: g.team1_id ? String(g.team1_id) : null,
      team2_id: g.team2_id ? String(g.team2_id) : null,
      winner_team_id: g.winner_team_id ? String(g.winner_team_id) : null,
    });
    gamesByPair.set(key, bucket);
  }

  let espnUpdatedGames = 0;
  let espnAlreadySet = 0;
  let espnSkippedNoTeamMap = 0;
  let espnSkippedPairNoMatch = 0;
  let espnSkippedPairAmbiguous = 0;
  let espnSkippedTie = 0;
  const changedGames: ChangedWinnerGame[] = [];

  for (const f of finals) {
    if (f.homeScore === f.awayScore) {
      espnSkippedTie++;
      continue;
    }

    const homeLocalIds = preferredLocalIdsForExternalTeam(localTeamsByEspn.get(f.homeTeamId) ?? []);
    const awayLocalIds = preferredLocalIdsForExternalTeam(localTeamsByEspn.get(f.awayTeamId) ?? []);
    if (homeLocalIds.length === 0 || awayLocalIds.length === 0) {
      espnSkippedNoTeamMap++;
      continue;
    }

    const matchedGamesById = new Map<string, LocalPairGame>();
    for (const homeLocalId of homeLocalIds) {
      for (const awayLocalId of awayLocalIds) {
        if (homeLocalId === awayLocalId) continue;
        const pair = teamPairKey(homeLocalId, awayLocalId);
        for (const candidate of gamesByPair.get(pair) ?? []) {
          matchedGamesById.set(candidate.id, candidate);
        }
      }
    }
    const matches = [...matchedGamesById.values()];
    const localGame = chooseBestMatchingGame(matches);
    if (!localGame) {
      espnSkippedPairNoMatch++;
      continue;
    }
    if (matches.length > 1) espnSkippedPairAmbiguous++;
    const homeIdSet = new Set(homeLocalIds);
    const awayIdSet = new Set(awayLocalIds);
    const homeLocalId =
      localGame.team1_id && homeIdSet.has(localGame.team1_id)
        ? localGame.team1_id
        : localGame.team2_id && homeIdSet.has(localGame.team2_id)
        ? localGame.team2_id
        : null;
    const awayLocalId =
      localGame.team1_id && awayIdSet.has(localGame.team1_id)
        ? localGame.team1_id
        : localGame.team2_id && awayIdSet.has(localGame.team2_id)
        ? localGame.team2_id
        : null;
    if (!homeLocalId || !awayLocalId || homeLocalId === awayLocalId) {
      espnSkippedPairAmbiguous++;
      continue;
    }

    const winnerLocalId = f.homeScore > f.awayScore ? homeLocalId : awayLocalId;
    if (localGame.winner_team_id === winnerLocalId) {
      espnAlreadySet++;
      continue;
    }

    const updatePayload: Record<string, unknown> = {
      winner_team_id: winnerLocalId,
      last_synced_at: nowIso,
    };
    if (canWriteStatus) updatePayload.status = "Final";

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update(updatePayload)
      .eq("id", localGame.id);
    if (updErr) throw updErr;

    localGame.winner_team_id = winnerLocalId;
    espnUpdatedGames++;
    changedGames.push({ gameId: localGame.id, winnerTeamId: winnerLocalId });
  }

  const propagation = await propagateWinnersToNextRounds(supabaseAdmin, nowIso);

  return {
    espnFinalsSeen: finals.length,
    espnUpdatedGames,
    espnAlreadySet,
    espnSkippedNoTeamMap,
    espnSkippedPairNoMatch,
    espnSkippedPairAmbiguous,
    espnSkippedTie,
    espnAdvancedSlotsUpdated: propagation.advancedSlotsUpdated,
    espnAdvancedGamesTouched: propagation.advancedGamesTouched,
    espnClearedInvalidWinners: propagation.clearedInvalidWinners,
    espnClearedInvalidSourceWinners: propagation.clearedInvalidSourceWinners,
    changedGames,
  };
}

async function applyEspnWorldCupFinalsToLocalGames(finals: FinalGame[]) {
  const supabaseAdmin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const canWriteStatus = await hasStatusColumn(supabaseAdmin);

  if (finals.length === 0) {
    const groupAdvancement = await applyWorldCupReferenceBracketToR32(supabaseAdmin, nowIso);
    const propagation = await propagateWinnersToNextRounds(supabaseAdmin, nowIso);
    return {
      worldCupFinalsSeen: 0,
      worldCupUpdatedGames: 0,
      worldCupAlreadySet: 0,
      worldCupSkippedNoTeamMap: 0,
      worldCupSkippedPairNoMatch: 0,
      worldCupSkippedPairAmbiguous: 0,
      worldCupAdvancedSlotsUpdated: propagation.advancedSlotsUpdated,
      worldCupAdvancedGamesTouched: propagation.advancedGamesTouched,
      worldCupClearedInvalidWinners: propagation.clearedInvalidWinners,
      worldCupClearedInvalidSourceWinners: propagation.clearedInvalidSourceWinners,
      worldCupGroupAdvancement: groupAdvancement,
      changedGames: [] as ChangedWinnerGame[],
    };
  }

  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id,name,region,seed,seed_in_region,espn_team_id")
    .eq("competition_slug", "world-cup");
  if (teamErr) throw teamErr;

  const localTeamsByEspn = new Map<number, TeamIdentityRow[]>();
  const localTeamsByName = new Map<string, TeamIdentityRow[]>();
  for (const t of (teamRows ?? []) as TeamIdentityRow[]) {
    addWorldCupTeamLookups(t, localTeamsByEspn, localTeamsByName);
  }

  const gameRows = (await fetchGamesForPairMatching(supabaseAdmin, false)).filter(
    (game) => game.competition_slug === "world-cup",
  );
  const gamesByPair = new Map<string, LocalPairGame[]>();
  for (const g of gameRows as LocalPairGame[]) {
    if (!g.team1_id || !g.team2_id) continue;
    const key = teamPairKey(String(g.team1_id), String(g.team2_id));
    const bucket = gamesByPair.get(key) ?? [];
    bucket.push({
      id: String(g.id),
      round: g.round ?? null,
      region: g.region ?? null,
      slot: g.slot ?? null,
      status: g.status ?? null,
      start_time: g.start_time ?? null,
      team1_id: g.team1_id ? String(g.team1_id) : null,
      team2_id: g.team2_id ? String(g.team2_id) : null,
      winner_team_id: g.winner_team_id ? String(g.winner_team_id) : null,
      competition_slug: g.competition_slug ?? null,
      team1_score: typeof g.team1_score === "number" ? g.team1_score : null,
      team2_score: typeof g.team2_score === "number" ? g.team2_score : null,
    });
    gamesByPair.set(key, bucket);
  }

  let worldCupUpdatedGames = 0;
  let worldCupAlreadySet = 0;
  let worldCupSkippedNoTeamMap = 0;
  let worldCupSkippedPairNoMatch = 0;
  let worldCupSkippedPairAmbiguous = 0;
  const changedGames: ChangedWinnerGame[] = [];

  for (const f of finals) {
    const homeLocalIds = preferredWorldCupLocalIds(
      localTeamsByEspn,
      localTeamsByName,
      f.homeTeamId,
      f.homeTeamName,
    );
    const awayLocalIds = preferredWorldCupLocalIds(
      localTeamsByEspn,
      localTeamsByName,
      f.awayTeamId,
      f.awayTeamName,
    );
    if (homeLocalIds.length === 0 || awayLocalIds.length === 0) {
      worldCupSkippedNoTeamMap++;
      continue;
    }

    const matchedGamesById = new Map<string, LocalPairGame>();
    for (const homeLocalId of homeLocalIds) {
      for (const awayLocalId of awayLocalIds) {
        if (homeLocalId === awayLocalId) continue;
        const pair = teamPairKey(homeLocalId, awayLocalId);
        for (const candidate of gamesByPair.get(pair) ?? []) {
          matchedGamesById.set(candidate.id, candidate);
        }
      }
    }
    const matches = [...matchedGamesById.values()];
    const localGame = chooseBestMatchingGame(matches);
    if (!localGame) {
      worldCupSkippedPairNoMatch++;
      continue;
    }
    if (matches.length > 1) worldCupSkippedPairAmbiguous++;

    const homeIdSet = new Set(homeLocalIds);
    const awayIdSet = new Set(awayLocalIds);
    const team1IsHome = localGame.team1_id ? homeIdSet.has(localGame.team1_id) : false;
    const team2IsHome = localGame.team2_id ? homeIdSet.has(localGame.team2_id) : false;
    const team1IsAway = localGame.team1_id ? awayIdSet.has(localGame.team1_id) : false;
    const team2IsAway = localGame.team2_id ? awayIdSet.has(localGame.team2_id) : false;
    if ((!team1IsHome && !team2IsHome) || (!team1IsAway && !team2IsAway)) {
      worldCupSkippedPairAmbiguous++;
      continue;
    }

    const team1Score = team1IsHome ? f.homeScore : f.awayScore;
    const team2Score = team2IsHome ? f.homeScore : f.awayScore;
    const winnerLocalId =
      team1Score > team2Score
        ? localGame.team1_id
        : team2Score > team1Score
        ? localGame.team2_id
        : null;

    const alreadySynced =
      localGame.winner_team_id === winnerLocalId &&
      localGame.team1_score === team1Score &&
      localGame.team2_score === team2Score &&
      norm(localGame.status).startsWith("final");
    if (alreadySynced) {
      worldCupAlreadySet++;
      continue;
    }

    const updatePayload: Record<string, unknown> = {
      winner_team_id: winnerLocalId,
      team1_score: team1Score,
      team2_score: team2Score,
      last_synced_at: nowIso,
    };
    if (canWriteStatus) updatePayload.status = "Final";

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update(updatePayload)
      .eq("id", localGame.id);
    if (updErr) throw updErr;

    localGame.winner_team_id = winnerLocalId;
    localGame.team1_score = team1Score;
    localGame.team2_score = team2Score;
    localGame.status = "Final";
    worldCupUpdatedGames++;
    if (winnerLocalId) changedGames.push({ gameId: localGame.id, winnerTeamId: winnerLocalId });
  }

  const groupAdvancement = await applyWorldCupReferenceBracketToR32(supabaseAdmin, nowIso);
  const propagation = await propagateWinnersToNextRounds(supabaseAdmin, nowIso);

  return {
    worldCupFinalsSeen: finals.length,
    worldCupUpdatedGames,
    worldCupAlreadySet,
    worldCupSkippedNoTeamMap,
    worldCupSkippedPairNoMatch,
    worldCupSkippedPairAmbiguous,
    worldCupAdvancedSlotsUpdated: propagation.advancedSlotsUpdated,
    worldCupAdvancedGamesTouched: propagation.advancedGamesTouched,
    worldCupClearedInvalidWinners: propagation.clearedInvalidWinners,
    worldCupClearedInvalidSourceWinners: propagation.clearedInvalidSourceWinners,
    worldCupGroupAdvancement: groupAdvancement,
    changedGames,
  };
}

async function applyFinalsToLocalGames(finals: FinalGame[]): Promise<FinalsApplyResult> {
  const supabaseAdmin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const canWriteStatus = await hasStatusColumn(supabaseAdmin);

  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id,name,region,seed,seed_in_region,sportsdata_team_id")
    .not("sportsdata_team_id", "is", null);
  if (teamErr) throw teamErr;

  const localTeamsBySports = new Map<number, TeamIdentityRow[]>();
  for (const t of (teamRows ?? []) as TeamIdentityRow[]) {
    const sportsId = Number(t.sportsdata_team_id);
    if (!Number.isFinite(sportsId)) continue;
    const key = Math.trunc(sportsId);
    const bucket = localTeamsBySports.get(key) ?? [];
    bucket.push(t);
    localTeamsBySports.set(key, bucket);
  }

  const allGameRows = await fetchGamesForPairMatching(supabaseAdmin, true);

  type LocalSyncGame = LocalPairGame & {
    id: string;
    sportsdata_game_id: number | null;
  };

  const allLocalGames: LocalSyncGame[] = (allGameRows as LocalSyncGame[]).map((g) => ({
    id: String(g.id),
    sportsdata_game_id: Number.isFinite(Number(g.sportsdata_game_id))
      ? Math.trunc(Number(g.sportsdata_game_id))
      : null,
    winner_team_id: g.winner_team_id ? String(g.winner_team_id) : null,
    round: g.round ?? null,
    region: g.region ?? null,
    slot: g.slot ?? null,
    status: g.status ?? null,
    start_time: g.start_time ?? null,
    team1_id: g.team1_id ? String(g.team1_id) : null,
    team2_id: g.team2_id ? String(g.team2_id) : null,
  }));

  const gamesById = new Map<string, LocalSyncGame>();
  const localBySportsGameId = new Map<number, LocalSyncGame>();
  const gamesByTeamPair = new Map<string, string[]>();

  for (const g of allLocalGames) {
    gamesById.set(g.id, g);
    if (g.sportsdata_game_id != null) {
      localBySportsGameId.set(g.sportsdata_game_id, g);
    }
    if (g.team1_id && g.team2_id) {
      const key = teamPairKey(g.team1_id, g.team2_id);
      const bucket = gamesByTeamPair.get(key) ?? [];
      bucket.push(g.id);
      gamesByTeamPair.set(key, bucket);
    }
  }

  let updatedGames = 0;
  let alreadySet = 0;
  let skippedUnlinked = 0;
  let skippedNoTeamMap = 0;
  let skippedTie = 0;
  let relinkedByTeamPair = 0;
  let skippedPairNoMatch = 0;
  let skippedPairAmbiguous = 0;
  let skippedWinnerNotInGame = 0;
  const changedGames: ChangedWinnerGame[] = [];

  for (const f of finals) {
    if (f.homeScore === f.awayScore) {
      skippedTie++;
      continue;
    }

    const homeLocalIds = preferredLocalIdsForExternalTeam(localTeamsBySports.get(f.homeTeamId) ?? []);
    const awayLocalIds = preferredLocalIdsForExternalTeam(localTeamsBySports.get(f.awayTeamId) ?? []);
    if (homeLocalIds.length === 0 || awayLocalIds.length === 0) {
      skippedNoTeamMap++;
      continue;
    }

    const homeIdSet = new Set(homeLocalIds);
    const awayIdSet = new Set(awayLocalIds);
    const gameMatchesExpectedPair = (g: LocalSyncGame | null | undefined) => {
      if (!g?.team1_id || !g.team2_id) return false;
      const team1IsHome = homeIdSet.has(g.team1_id);
      const team2IsHome = homeIdSet.has(g.team2_id);
      const team1IsAway = awayIdSet.has(g.team1_id);
      const team2IsAway = awayIdSet.has(g.team2_id);
      return (team1IsHome && team2IsAway) || (team2IsHome && team1IsAway);
    };

    let localGame = localBySportsGameId.get(f.gameId) ?? null;
    if (!gameMatchesExpectedPair(localGame)) {
      const matchedGamesById = new Map<string, LocalSyncGame>();
      for (const homeLocalId of homeLocalIds) {
        for (const awayLocalId of awayLocalIds) {
          if (homeLocalId === awayLocalId) continue;
          const pair = teamPairKey(homeLocalId, awayLocalId);
          for (const candidateId of gamesByTeamPair.get(pair) ?? []) {
            const candidate = gamesById.get(candidateId);
            if (candidate) matchedGamesById.set(candidate.id, candidate);
          }
        }
      }
      const matches = [...matchedGamesById.values()];
      const candidate = chooseBestMatchingGame(matches) as LocalSyncGame | null;
      if (!candidate) {
        skippedPairNoMatch++;
        skippedUnlinked++;
        continue;
      }
      if (matches.length > 1) skippedPairAmbiguous++;

      const previousOwner = localBySportsGameId.get(f.gameId) ?? null;
      if (previousOwner && previousOwner.id !== candidate.id) {
        const { error: clearPrevErr } = await supabaseAdmin
          .from("games")
          .update({ sportsdata_game_id: null, last_synced_at: nowIso })
          .eq("id", previousOwner.id)
          .eq("sportsdata_game_id", f.gameId);
        if (clearPrevErr) throw clearPrevErr;
        previousOwner.sportsdata_game_id = null;
      }

      if (candidate.sportsdata_game_id !== f.gameId) {
        const oldSportsId = candidate.sportsdata_game_id;
        const { error: relinkErr } = await supabaseAdmin
          .from("games")
          .update({ sportsdata_game_id: f.gameId, last_synced_at: nowIso })
          .eq("id", candidate.id);
        if (relinkErr) throw relinkErr;

        if (oldSportsId != null) {
          localBySportsGameId.delete(oldSportsId);
        }
        candidate.sportsdata_game_id = f.gameId;
        localBySportsGameId.set(f.gameId, candidate);
        relinkedByTeamPair++;
      }

      localGame = candidate;
    }

    if (!localGame) {
      skippedUnlinked++;
      continue;
    }

    const homeLocalId =
      localGame.team1_id && homeIdSet.has(localGame.team1_id)
        ? localGame.team1_id
        : localGame.team2_id && homeIdSet.has(localGame.team2_id)
        ? localGame.team2_id
        : null;
    const awayLocalId =
      localGame.team1_id && awayIdSet.has(localGame.team1_id)
        ? localGame.team1_id
        : localGame.team2_id && awayIdSet.has(localGame.team2_id)
        ? localGame.team2_id
        : null;
    if (!homeLocalId || !awayLocalId || homeLocalId === awayLocalId) {
      skippedPairAmbiguous++;
      continue;
    }

    const winnerLocalId = f.homeScore > f.awayScore ? homeLocalId : awayLocalId;
    if (winnerLocalId !== localGame.team1_id && winnerLocalId !== localGame.team2_id) {
      skippedWinnerNotInGame++;
      continue;
    }

    if (localGame.winner_team_id === winnerLocalId) {
      alreadySet++;
      continue;
    }

    const updatePayload: Record<string, unknown> = {
      winner_team_id: winnerLocalId,
      last_synced_at: nowIso,
    };
    if (canWriteStatus) updatePayload.status = "Final";

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update(updatePayload)
      .eq("id", localGame.id);
    if (updErr) throw updErr;

    localGame.winner_team_id = winnerLocalId;
    updatedGames++;
    changedGames.push({ gameId: localGame.id, winnerTeamId: winnerLocalId });
  }

  const playInResolution = await applyPlayInWinnersToR64Slots(supabaseAdmin, nowIso);
  const propagation = await propagateWinnersToNextRounds(supabaseAdmin, nowIso);

  return {
    finalsSeen: finals.length,
    updatedGames,
    alreadySet,
    skippedUnlinked,
    skippedNoTeamMap,
    skippedTie,
    relinkedByTeamPair,
    skippedPairNoMatch,
    skippedPairAmbiguous,
    skippedWinnerNotInGame,
    ...playInResolution,
    ...propagation,
    changedGames,
  };
}

export async function runDailySync(lookbackDays: number) {
  const dates: string[] = [];
  const allGames: SportsGame[] = [];
  const sportsDataWarnings: string[] = [];
  let stopSportsDataFetch = !KEY;

  if (!KEY) {
    sportsDataWarnings.push("SPORTS_DATA_IO_KEY missing; using ESPN fallback only.");
  }

  for (let i = 0; i <= lookbackDays; i++) {
    const date = ymd(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    dates.push(date);
    if (stopSportsDataFetch) continue;

    try {
      const games = await fetchGamesByDateFinal(date);
      allGames.push(...games);
    } catch (error: unknown) {
      const message = describeError(error);
      sportsDataWarnings.push(`${date}: ${message}`);
      if (isSportsDataQuotaError(message)) {
        stopSportsDataFetch = true;
      }
    }
  }

  const finals = collectFinalGames(allGames);
  const result = await applyFinalsToLocalGames(finals);
  const espnFallback = await applyEspnFinalsToLocalGames(
    await fetchEspnFinalGames(Math.max(lookbackDays, 1))
  );
  const worldCupSync = await applyEspnWorldCupFinalsToLocalGames(
    await fetchEspnWorldCupFinalGames(Math.max(lookbackDays, 1))
  );
  const notifications = await sendPoolFinalUpdateNotifications([
    ...(result.changedGames ?? []),
    ...((espnFallback.changedGames as ChangedWinnerGame[] | undefined) ?? []),
    ...((worldCupSync.changedGames as ChangedWinnerGame[] | undefined) ?? []),
  ]);

  return {
    mode: "daily" as const,
    dates,
    ...result,
    updatedGames: result.updatedGames + espnFallback.espnUpdatedGames + worldCupSync.worldCupUpdatedGames,
    advancedSlotsUpdated:
      Number(result.advancedSlotsUpdated ?? 0) +
      Number(espnFallback.espnAdvancedSlotsUpdated ?? 0) +
      Number(worldCupSync.worldCupAdvancedSlotsUpdated ?? 0) +
      Number(worldCupSync.worldCupGroupAdvancement?.groupSlotsUpdated ?? 0) +
      Number(worldCupSync.worldCupGroupAdvancement?.thirdPlaceSlotsUpdated ?? 0),
    advancedGamesTouched: Math.max(
      Number(result.advancedGamesTouched ?? 0),
      Number(espnFallback.espnAdvancedGamesTouched ?? 0)
    ),
    notifications,
    sportsDataWarnings,
    espnFallback,
    worldCupSync,
  };
}

async function runTournamentSeasonSync(season: number) {
  let games: SportsGame[] = [];
  const sportsDataWarnings: string[] = [];

  if (!KEY) {
    sportsDataWarnings.push("SPORTS_DATA_IO_KEY missing; using ESPN fallback only.");
  } else {
    try {
      games = await fetchTournamentGames(season);
    } catch (error: unknown) {
      sportsDataWarnings.push(describeError(error));
    }
  }

  const finals = collectFinalGames(games);
  const result = await applyFinalsToLocalGames(finals);
  const espnFallback = await applyEspnFinalsToLocalGames(
    await fetchEspnFinalGames(Math.max(DEFAULT_LOOKBACK_DAYS, 3))
  );
  const notifications = await sendPoolFinalUpdateNotifications([
    ...(result.changedGames ?? []),
    ...((espnFallback.changedGames as ChangedWinnerGame[] | undefined) ?? []),
  ]);

  return {
    mode: "tournament" as const,
    season,
    totalGamesInPayload: games.length,
    ...result,
    updatedGames: result.updatedGames + espnFallback.espnUpdatedGames,
    advancedSlotsUpdated:
      Number(result.advancedSlotsUpdated ?? 0) +
      Number(espnFallback.espnAdvancedSlotsUpdated ?? 0),
    advancedGamesTouched: Math.max(
      Number(result.advancedGamesTouched ?? 0),
      Number(espnFallback.espnAdvancedGamesTouched ?? 0)
    ),
    notifications,
    sportsDataWarnings,
    espnFallback,
  };
}

async function parseSyncParams(req: Request) {
  const url = new URL(req.url);

  let season = toSeason(url.searchParams.get("season"));
  let lookbackDays = DEFAULT_LOOKBACK_DAYS;

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (!season) season = toSeason(body?.season);

      const bodyLookback = Number(body?.lookbackDays);
      if (Number.isFinite(bodyLookback) && bodyLookback >= 0 && bodyLookback <= 14) {
        lookbackDays = Math.trunc(bodyLookback);
      }
    } catch {
      // Ignore empty or invalid JSON bodies.
    }
  }

  return { season, lookbackDays };
}

async function handleSync(req: Request) {
  const { season, lookbackDays } = await parseSyncParams(req);
  if (season) return runTournamentSeasonSync(season);
  return runDailySync(lookbackDays);
}

export async function GET(req: Request) {
  try {
    const auth = await requireSiteAdminOrCron(req);
    if ("response" in auth) return auth.response;

    const result = await handleSync(req);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
