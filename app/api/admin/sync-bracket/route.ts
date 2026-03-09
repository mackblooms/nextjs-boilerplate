import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const KEY = process.env.SPORTS_DATA_IO_KEY ?? process.env.SPORTSDATAIO_KEY;
const BASE = "https://api.sportsdata.io";
const DEFAULT_SEASON = 2026;

type SportsGame = {
  GameID?: number;
  GameId?: number;
  gameId?: number;
  Bracket?: string | null;
  bracket?: string | null;
  Round?: number | string | null;
  round?: number | string | null;
  Slot?: number | string | null;
  slot?: number | string | null;
  TournamentDisplayOrder?: number | string | null;
  BracketPosition?: number | string | null;
  HomeTeamID?: number | null;
  AwayTeamID?: number | null;
};

type LocalGameRow = {
  id: string;
  sportsdata_game_id: number | null;
};

async function fetchJsonOrEmpty(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    body: text,
    json: (() => {
      try {
        return text && text.trim() ? JSON.parse(text) : null;
      } catch {
        return null;
      }
    })(),
  };
}

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

function bracketToRegion(bracket: unknown): "East" | "West" | "South" | "Midwest" | null {
  const b = norm(bracket);
  if (b.includes("east")) return "East";
  if (b.includes("west")) return "West";
  if (b.includes("south")) return "South";
  if (b.includes("midwest")) return "Midwest";
  return null;
}

function roundToCode(roundValue: unknown): "R64" | "R32" | "S16" | "E8" | "F4" | "CHIP" | null {
  const roundText = norm(roundValue);
  const asNum = Number(roundValue);

  if (!Number.isNaN(asNum)) {
    if (asNum === 1) return "R64";
    if (asNum === 2) return "R32";
    if (asNum === 3) return "S16";
    if (asNum === 4) return "E8";
    if (asNum === 5) return "F4";
    if (asNum === 6) return "CHIP";
  }

  if (roundText.includes("64")) return "R64";
  if (roundText.includes("32")) return "R32";
  if (roundText.includes("16") || roundText.includes("sweet")) return "S16";
  if (roundText.includes("elite")) return "E8";
  if (roundText.includes("final four") || roundText === "f4" || roundText.includes("semifinal")) return "F4";
  if (roundText.includes("champ")) return "CHIP";

  return null;
}

function readSlot(g: SportsGame): number | null {
  const candidates = [g.Slot, g.slot, g.TournamentDisplayOrder, g.BracketPosition];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function getSportsGameId(g: SportsGame): number | null {
  const n = Number(g.GameID ?? g.GameId ?? g.gameId);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function runSyncBracket() {
  if (!KEY) throw new Error("Missing SportsData key. Set SPORTS_DATA_IO_KEY or SPORTSDATAIO_KEY.");

  const season = DEFAULT_SEASON;
  const url = `${BASE}/v3/cbb/scores/json/Tournament/${season}?key=${encodeURIComponent(KEY)}`;
  const resp = await fetchJsonOrEmpty(url);

  if (resp.ok && (!resp.body || !resp.body.trim())) {
    return {
      season,
      url,
      status: resp.status,
      note: "Tournament data not available yet (empty response body).",
    };
  }

  if (!resp.ok) {
    throw new Error(
      `SportsDataIO ${resp.status} ${resp.statusText}\nURL: ${url}\nBody:\n${resp.body || "(empty)"}`
    );
  }

  if (!resp.json) {
    throw new Error(
      `SportsDataIO returned non-JSON.\nURL: ${url}\nFirst 500 chars:\n${(resp.body || "").slice(0, 500)}`
    );
  }

  const raw = resp.json as unknown;
  const gamesArray: SportsGame[] | null = Array.isArray(raw)
    ? (raw as SportsGame[])
    : Array.isArray((raw as { Games?: unknown[] })?.Games)
    ? ((raw as { Games: SportsGame[] }).Games as SportsGame[])
    : Array.isArray((raw as { games?: unknown[] })?.games)
    ? ((raw as { games: SportsGame[] }).games as SportsGame[])
    : null;

  if (!gamesArray) {
    return {
      season,
      url,
      status: resp.status,
      note: "Tournament returned JSON, but no games array was found.",
      receivedType: Array.isArray(raw) ? "array" : typeof raw,
      sampleKeys:
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? Object.keys(raw as Record<string, unknown>).slice(0, 40)
          : null,
    };
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id,sportsdata_team_id")
    .not("sportsdata_team_id", "is", null);
  if (teamErr) throw teamErr;

  const localTeamBySports = new Map<number, string>();
  for (const t of teamRows ?? []) {
    localTeamBySports.set(Number(t.sportsdata_team_id), String(t.id));
  }

  let linked = 0;
  let alreadyLinked = 0;
  let skippedNoMap = 0;
  let skippedAmbiguous = 0;
  let matchedBySlot = 0;
  let matchedByTeams = 0;

  for (const g of gamesArray) {
    const gameId = getSportsGameId(g);
    const roundCode = roundToCode(g.Round ?? g.round);
    const region = bracketToRegion(g.Bracket ?? g.bracket);
    const slot = readSlot(g);

    if (!gameId || !roundCode) {
      skippedNoMap++;
      continue;
    }

    let ourGame: LocalGameRow | null = null;

    if (slot) {
      let slotQuery = supabaseAdmin
        .from("games")
        .select("id,sportsdata_game_id")
        .eq("round", roundCode)
        .eq("slot", slot)
        .limit(2);

      if (roundCode === "R64" || roundCode === "R32" || roundCode === "S16" || roundCode === "E8") {
        if (region) slotQuery = slotQuery.eq("region", region);
      }

      const { data: slotMatches, error: slotErr } = await slotQuery;
      if (slotErr) throw slotErr;

      if ((slotMatches?.length ?? 0) === 1) {
        ourGame = slotMatches?.[0] as LocalGameRow;
        matchedBySlot++;
      } else if ((slotMatches?.length ?? 0) > 1) {
        skippedAmbiguous++;
        continue;
      }
    }

    if (!ourGame) {
      const homeLocal = localTeamBySports.get(Number(g.HomeTeamID));
      const awayLocal = localTeamBySports.get(Number(g.AwayTeamID));

      if (homeLocal && awayLocal) {
        let teamQuery = supabaseAdmin
          .from("games")
          .select("id,sportsdata_game_id")
          .eq("round", roundCode)
          .or(
            `and(team1_id.eq.${homeLocal},team2_id.eq.${awayLocal}),and(team1_id.eq.${awayLocal},team2_id.eq.${homeLocal})`
          )
          .limit(2);

        if ((roundCode === "R64" || roundCode === "R32" || roundCode === "S16" || roundCode === "E8") && region) {
          teamQuery = teamQuery.eq("region", region);
        }

        const { data: teamMatches, error: teamErr2 } = await teamQuery;
        if (teamErr2) throw teamErr2;

        if ((teamMatches?.length ?? 0) === 1) {
          ourGame = teamMatches?.[0] as LocalGameRow;
          matchedByTeams++;
        } else if ((teamMatches?.length ?? 0) > 1) {
          skippedAmbiguous++;
          continue;
        }
      }
    }

    if (!ourGame) {
      skippedNoMap++;
      continue;
    }

    if (ourGame.sportsdata_game_id === gameId) {
      alreadyLinked++;
      continue;
    }

    const { error: updErr } = await supabaseAdmin
      .from("games")
      .update({
        sportsdata_game_id: gameId,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", ourGame.id);

    if (updErr) throw updErr;
    linked++;
  }

  return {
    season,
    url,
    status: resp.status,
    note: "Linked SportsData games to local games using bracket hierarchy first, then team fallback.",
    totalGamesInPayload: gamesArray.length,
    linked,
    alreadyLinked,
    matchedBySlot,
    matchedByTeams,
    skippedNoMap,
    skippedAmbiguous,
    sampleGame: gamesArray[0] ?? null,
  };
}

export async function GET() {
  try {
    const result = await runSyncBracket();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
