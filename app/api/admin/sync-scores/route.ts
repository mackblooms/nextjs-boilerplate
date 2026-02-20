import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const KEY = process.env.SPORTS_DATA_IO_KEY;
const BASE = "https://api.sportsdata.io";

// YYYY-MM-DD (SportsDataIO expects this for BoxScoresByDate)
function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function runSync() {
  const supabaseAdmin = getSupabaseAdmin();

  if (!KEY) throw new Error("SPORTS_DATA_IO_KEY is missing");

  // Today + yesterday (covers late games / timezone edge cases)
  const dates = [ymd(new Date()), ymd(new Date(Date.now() - 24 * 60 * 60 * 1000))];

  let updatedGames = 0;
  let finalsSeen = 0;

  for (const date of dates) {
    const url = `${BASE}/v3/cbb/scores/json/GamesByDateFinal/${date}?key=${KEY}`;


    const res = await fetch(url, { cache: "no-store" });


    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`SportsDataIO error ${res.status}: ${txt}`);
    }

    const games = await res.json();

    for (const g of games ?? []) {
      // Your sample JSON uses "Final"
      if (g.Status !== "Final") continue;

      finalsSeen++;

      const sportsdataGameId = g.GameID;
      const homeTeamId = g.HomeTeamID;
      const awayTeamId = g.AwayTeamID;
      const homeScore = g.HomeTeamScore;
      const awayScore = g.AwayTeamScore;

      if (!sportsdataGameId || homeScore == null || awayScore == null) continue;

      // Find the game row you already linked (games.sportsdata_game_id)
      const { data: gameRow, error: gameFindErr } = await supabaseAdmin
        .from("games")
        .select("id")
        .eq("sportsdata_game_id", sportsdataGameId)
        .maybeSingle();

      if (gameFindErr) throw gameFindErr;
      if (!gameRow) continue; // not linked yet in your DB

      // Map SportsDataIO TeamIDs -> your teams.id via teams.sportsdata_team_id
      const { data: teamRows, error: teamErr } = await supabaseAdmin
        .from("teams")
        .select("id,sportsdata_team_id")
        .in("sportsdata_team_id", [homeTeamId, awayTeamId]);

      if (teamErr) throw teamErr;

      const map = new Map<number, string>();
      for (const t of teamRows ?? []) map.set(t.sportsdata_team_id, t.id);

      const homeLocalId = map.get(homeTeamId);
      const awayLocalId = map.get(awayTeamId);

      if (!homeLocalId || !awayLocalId) continue;

      const winnerLocalId = homeScore > awayScore ? homeLocalId : awayLocalId;

      const { error: updErr } = await supabaseAdmin
        .from("games")
        .update({ winner_team_id: winnerLocalId })
        .eq("id", gameRow.id);

      if (updErr) throw updErr;

      updatedGames++;
    }
  }

  return { dates, finalsSeen, updatedGames };
}

export async function GET() {
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST() {
  // Same behavior as GET so you can trigger either way
  return GET();
}
