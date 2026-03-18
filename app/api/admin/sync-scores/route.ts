import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const KEY = process.env.SPORTS_DATA_IO_KEY ?? process.env.SPORTSDATAIO_KEY;
const BASE = "https://api.sportsdata.io";
const DEFAULT_LOOKBACK_DAYS = 1;

type SportsGame = {
  Status?: string;
  GameID?: number;
  HomeTeamID?: number;
  AwayTeamID?: number;
  HomeTeamScore?: number | null;
  AwayTeamScore?: number | null;
};

type FinalGame = {
  gameId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
};

type LocalBracketGame = {
  id: string;
  round: string | null;
  region: string | null;
  slot: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type PropagationTarget = {
  round: "R32" | "S16" | "E8" | "F4" | "CHIP";
  region: string | null;
  slot: number;
  side: "team1_id" | "team2_id";
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

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

function isMissingColumnError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

function toSeason(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const year = Math.trunc(n);
  if (year < 2000 || year > 2100) return null;
  return year;
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

function gameKey(round: string, region: string | null, slot: number): string {
  if (round === "R64" || round === "R32" || round === "S16" || round === "E8") {
    return `${round}|${norm(region)}|${slot}`;
  }
  return `${round}|${slot}`;
}

function nextTargetForWinner(g: LocalBracketGame): PropagationTarget | null {
  const round = String(g.round ?? "").toUpperCase();
  const slot = Number(g.slot);
  if (!Number.isFinite(slot) || slot < 1) return null;

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

async function hasStatusColumn(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  const { error } = await supabaseAdmin.from("games").select("id,status").limit(1);
  if (!error) return true;
  if (isMissingColumnError(String(error.message ?? ""))) return false;
  throw error;
}

async function propagateWinnersToNextRounds(supabaseAdmin: ReturnType<typeof getSupabaseAdmin>, nowIso: string) {
  const { data: allGames, error: gamesErr } = await supabaseAdmin
    .from("games")
    .select("id,round,region,slot,team1_id,team2_id,winner_team_id");
  if (gamesErr) throw gamesErr;

  const games = ((allGames ?? []) as LocalBracketGame[]).map((g) => ({
    ...g,
    id: String(g.id),
  }));

  const byId = new Map<string, LocalBracketGame>();
  const byKey = new Map<string, LocalBracketGame>();
  for (const g of games) {
    byId.set(g.id, g);
    const round = String(g.round ?? "").toUpperCase();
    const slot = Number(g.slot);
    if (!Number.isFinite(slot) || slot < 1 || !round) continue;
    byKey.set(gameKey(round, g.region ?? null, Math.trunc(slot)), g);
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
  const touchedGameIds = new Set<string>();

  for (const source of sorted) {
    const winnerId = source.winner_team_id ? String(source.winner_team_id) : null;
    if (!winnerId) continue;

    const targetRef = nextTargetForWinner(source);
    if (!targetRef) continue;

    const target = byKey.get(gameKey(targetRef.round, targetRef.region, targetRef.slot));
    if (!target) continue;

    const nextTeam1 = targetRef.side === "team1_id" ? winnerId : (target.team1_id ? String(target.team1_id) : null);
    const nextTeam2 = targetRef.side === "team2_id" ? winnerId : (target.team2_id ? String(target.team2_id) : null);

    const updatePayload: Record<string, unknown> = { last_synced_at: nowIso };
    if (targetRef.side === "team1_id" && String(target.team1_id ?? "") !== winnerId) {
      updatePayload.team1_id = winnerId;
      advancedSlotsUpdated++;
    }
    if (targetRef.side === "team2_id" && String(target.team2_id ?? "") !== winnerId) {
      updatePayload.team2_id = winnerId;
      advancedSlotsUpdated++;
    }

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

    if ("team1_id" in updatePayload) target.team1_id = String(updatePayload.team1_id);
    if ("team2_id" in updatePayload) target.team2_id = String(updatePayload.team2_id);
    if ("winner_team_id" in updatePayload) target.winner_team_id = null;

    touchedGameIds.add(target.id);
  }

  advancedGamesTouched = touchedGameIds.size;
  return { advancedSlotsUpdated, advancedGamesTouched, clearedInvalidWinners };
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

async function applyFinalsToLocalGames(finals: FinalGame[]) {
  const supabaseAdmin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const canWriteStatus = await hasStatusColumn(supabaseAdmin);

  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id,sportsdata_team_id")
    .not("sportsdata_team_id", "is", null);
  if (teamErr) throw teamErr;

  const localTeamBySports = new Map<number, string>();
  for (const t of teamRows ?? []) {
    localTeamBySports.set(Number(t.sportsdata_team_id), String(t.id));
  }

  const sportsIds = Array.from(new Set(finals.map((f) => f.gameId)));
  let localGames: Array<{ id: string; sportsdata_game_id: number | null; winner_team_id: string | null }> = [];
  if (sportsIds.length > 0) {
    const { data, error: localErr } = await supabaseAdmin
      .from("games")
      .select("id,sportsdata_game_id,winner_team_id")
      .in("sportsdata_game_id", sportsIds);
    if (localErr) throw localErr;
    localGames = (data ?? []) as Array<{ id: string; sportsdata_game_id: number | null; winner_team_id: string | null }>;
  }

  const localBySportsGameId = new Map<number, { id: string; winner_team_id: string | null }>();
  for (const g of localGames ?? []) {
    localBySportsGameId.set(Number(g.sportsdata_game_id), {
      id: String(g.id),
      winner_team_id: g.winner_team_id ? String(g.winner_team_id) : null,
    });
  }

  let updatedGames = 0;
  let alreadySet = 0;
  let skippedUnlinked = 0;
  let skippedNoTeamMap = 0;
  let skippedTie = 0;

  for (const f of finals) {
    const localGame = localBySportsGameId.get(f.gameId);
    if (!localGame) {
      skippedUnlinked++;
      continue;
    }

    if (f.homeScore === f.awayScore) {
      skippedTie++;
      continue;
    }

    const homeLocalId = localTeamBySports.get(f.homeTeamId);
    const awayLocalId = localTeamBySports.get(f.awayTeamId);
    if (!homeLocalId || !awayLocalId) {
      skippedNoTeamMap++;
      continue;
    }

    const winnerLocalId = f.homeScore > f.awayScore ? homeLocalId : awayLocalId;
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
    ...playInResolution,
    ...propagation,
  };
}

async function runDailySync(lookbackDays: number) {
  const dates: string[] = [];
  const allGames: SportsGame[] = [];

  for (let i = 0; i <= lookbackDays; i++) {
    const date = ymd(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    dates.push(date);
    const games = await fetchGamesByDateFinal(date);
    allGames.push(...games);
  }

  const finals = collectFinalGames(allGames);
  const result = await applyFinalsToLocalGames(finals);

  return {
    mode: "daily" as const,
    dates,
    ...result,
  };
}

async function runTournamentSeasonSync(season: number) {
  const games = await fetchTournamentGames(season);
  const finals = collectFinalGames(games);
  const result = await applyFinalsToLocalGames(finals);

  return {
    mode: "tournament" as const,
    season,
    totalGamesInPayload: games.length,
    ...result,
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
  if (!KEY) throw new Error("SPORTS_DATA_IO_KEY is missing");

  const { season, lookbackDays } = await parseSyncParams(req);
  if (season) return runTournamentSeasonSync(season);
  return runDailySync(lookbackDays);
}

export async function GET(req: Request) {
  try {
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

