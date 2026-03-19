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

function teamPairKey(teamA: string, teamB: string) {
  return teamA < teamB ? `${teamA}|${teamB}` : `${teamB}|${teamA}`;
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

  const byKey = new Map<string, LocalBracketGame>();
  for (const g of games) {
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

    const target = byKey.get(gameKey(targetRef.round, targetRef.region, targetRef.slot));
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

  const { data: allGameRows, error: allGamesErr } = await supabaseAdmin
    .from("games")
    .select("id,sportsdata_game_id,winner_team_id,team1_id,team2_id");
  if (allGamesErr) throw allGamesErr;

  type LocalSyncGame = {
    id: string;
    sportsdata_game_id: number | null;
    winner_team_id: string | null;
    team1_id: string | null;
    team2_id: string | null;
  };

  const allLocalGames: LocalSyncGame[] = ((allGameRows ?? []) as LocalSyncGame[]).map((g) => ({
    id: String(g.id),
    sportsdata_game_id: Number.isFinite(Number(g.sportsdata_game_id))
      ? Math.trunc(Number(g.sportsdata_game_id))
      : null,
    winner_team_id: g.winner_team_id ? String(g.winner_team_id) : null,
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

  for (const f of finals) {
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

    const expectedPair = teamPairKey(homeLocalId, awayLocalId);
    const gameMatchesExpectedPair = (g: LocalSyncGame | null | undefined) => {
      if (!g?.team1_id || !g.team2_id) return false;
      return teamPairKey(g.team1_id, g.team2_id) === expectedPair;
    };

    let localGame = localBySportsGameId.get(f.gameId) ?? null;
    if (!gameMatchesExpectedPair(localGame)) {
      const candidateIds = gamesByTeamPair.get(expectedPair) ?? [];
      if (candidateIds.length === 0) {
        skippedPairNoMatch++;
        skippedUnlinked++;
        continue;
      }
      if (candidateIds.length > 1) {
        skippedPairAmbiguous++;
        skippedUnlinked++;
        continue;
      }

      const candidate = gamesById.get(candidateIds[0]) ?? null;
      if (!candidate) {
        skippedUnlinked++;
        continue;
      }

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

