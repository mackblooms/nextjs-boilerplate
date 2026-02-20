import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const KEY = process.env.SPORTS_DATA_IO_KEY;
const BASE = "https://api.sportsdata.io";

/**
 * IMPORTANT:
 * Replace ENDPOINT_PATH with the exact path from SportsDataIO docs for:
 * NCAA Basketball -> Games (or Schedule) that includes tournament games.
 *
 * For example it might look like one of these patterns (NOT guaranteed):
 *  - /v3/cbb/scores/json/Games/2026POST
 *  - /v3/cbb/scores/json/GamesByDate/{date}
 *  - /v3/cbb/scores/json/Games/2026
 *
 * You will paste the exact path you see in SportsDataIO.
 */
const ENDPOINT_PATH = "<PASTE_SPORTSDATAIO_TOURNAMENT_GAMES_PATH_HERE>";

function toIso(d: any): string | null {
  if (!d) return null;
  // SportsDataIO usually gives ISO strings already
  const s = String(d);
  if (!s) return null;
  return s;
}

function toDateOnly(d: any): string | null {
  const iso = toIso(d);
  return iso ? iso.slice(0, 10) : null;
}

// Map SportsDataIO "Round" number -> your app round codes (adjust if you use different labels)
function mapRound(roundNum: number | null | undefined): string {
  // These are common conventions but you should adjust to YOUR rounds.
  // If your app uses: R64, R32, S16, E8, F4, CHIP:
  switch (roundNum) {
    case 1: return "R64";
    case 2: return "R32";
    case 3: return "S16";
    case 4: return "E8";
    case 5: return "F4";
    case 6: return "CHIP";
    default: return "UNK";
  }
}

async function fetchTournamentGames(): Promise<any[]> {
  if (!KEY) throw new Error("SPORTS_DATA_IO_KEY is missing.");
  if (ENDPOINT_PATH.includes("<PASTE_")) {
    throw new Error("You must set ENDPOINT_PATH in import-schedule/route.ts.");
  }

  const url = `${BASE}${ENDPOINT_PATH}`;

  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SportsDataIO error ${res.status}: ${txt}`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json : (json?.Games ?? []);
}

export async function POST() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const games = await fetchTournamentGames();

    // 1) Build SportsData TeamID -> your teams.id map
    //    We only need teams that appear in the schedule
    const teamIds = new Set<number>();
    for (const g of games) {
      if (typeof g?.HomeTeamID === "number") teamIds.add(g.HomeTeamID);
      if (typeof g?.AwayTeamID === "number") teamIds.add(g.AwayTeamID);
    }

    const teamIdArr = Array.from(teamIds);
    const { data: teamRows, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id,sportsdata_team_id")
      .in("sportsdata_team_id", teamIdArr);

    if (teamErr) throw teamErr;

    const sportsToLocal = new Map<number, string>();
    for (const t of teamRows ?? []) {
      if (t.sportsdata_team_id != null) sportsToLocal.set(t.sportsdata_team_id, t.id);
    }

    // 2) Convert SportsData games -> rows for your games table
    const upserts: any[] = [];
    let skippedMissingTeams = 0;

    for (const g of games) {
      const sportsdataGameId = g?.GameID;
      if (!sportsdataGameId) continue;

      const homeSportsId: number | null = typeof g?.HomeTeamID === "number" ? g.HomeTeamID : null;
      const awaySportsId: number | null = typeof g?.AwayTeamID === "number" ? g.AwayTeamID : null;

      const homeLocal = homeSportsId != null ? sportsToLocal.get(homeSportsId) : null;
      const awayLocal = awaySportsId != null ? sportsToLocal.get(awaySportsId) : null;

      // If the bracket/game includes TBD/play-in placeholders, you may not have a team mapping yet.
      if (!homeLocal || !awayLocal) {
        skippedMissingTeams++;
        continue;
      }

      // SportsData gives Bracket (region-ish) in many tournament feeds
      const region = g?.Bracket ?? g?.Region ?? null;

      // SportsData Round is often numeric
      const roundNum = typeof g?.Round === "number" ? g.Round : null;
      const round = mapRound(roundNum);

      // Use DateTimeUTC if present; otherwise DateTime; otherwise Day
      const start = toIso(g?.DateTimeUTC ?? g?.DateTime ?? null);
      const day = toDateOnly(g?.Day ?? g?.DateTimeUTC ?? g?.DateTime ?? null);

      upserts.push({
        sportsdata_game_id: sportsdataGameId,
        status: g?.Status ?? null,
        start_time: start,
        game_date: day,
        region,
        round,
        // Put teams into your structure:
        team1_id: awayLocal, // or homeLocal first—doesn't matter as long as you're consistent
        team2_id: homeLocal,
        // winner_team_id should be reset on import so scoring stays clean
        winner_team_id: null,
        last_synced_at: null,
        // optional if you added it:
        season: g?.Season ?? null,
      });
    }

    // 3) “Replace”: delete existing season games (optional) then upsert fresh
    // If you added season column and g.Season is reliable, you can do targeted delete.
    // Otherwise, skip delete and rely on upsert by sportsdata_game_id.
    //
    // If you want a hard wipe of ALL games, you could delete without a where clause,
    // but I’m not doing that automatically.
    //
    // Recommended minimal approach: upsert by sportsdata_game_id.
    const { error: upErr } = await supabaseAdmin
      .from("games")
      .upsert(upserts, { onConflict: "sportsdata_game_id" });

    if (upErr) throw upErr;

    return NextResponse.json({
      ok: true,
      totalFetched: games.length,
      upserted: upserts.length,
      skippedMissingTeams,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
