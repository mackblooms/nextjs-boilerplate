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

  if (finals.length === 0) {
    return {
      finalsSeen: 0,
      updatedGames: 0,
      alreadySet: 0,
      skippedUnlinked: 0,
      skippedNoTeamMap: 0,
      skippedTie: 0,
    };
  }

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
  const { data: localGames, error: localErr } = await supabaseAdmin
    .from("games")
    .select("id,sportsdata_game_id,winner_team_id")
    .in("sportsdata_game_id", sportsIds);
  if (localErr) throw localErr;

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

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update({
        winner_team_id: winnerLocalId,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", localGame.id);
    if (updErr) throw updErr;

    localGame.winner_team_id = winnerLocalId;
    updatedGames++;
  }

  return {
    finalsSeen: finals.length,
    updatedGames,
    alreadySet,
    skippedUnlinked,
    skippedNoTeamMap,
    skippedTie,
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

