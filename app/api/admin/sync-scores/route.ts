import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

// IMPORTANT: put your SportsDataIO key in Vercel env var SPORTS_DATA_IO_KEY
// and your base URL in SPORTS_DATA_IO_BASE (optional).
const KEY = process.env.SPORTS_DATA_IO_KEY;
const BASE = process.env.SPORTS_DATA_IO_BASE ?? "https://api.sportsdata.io";

function ymd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchBoxScoresByDate(date: string) {
  if (!KEY) throw new Error("SPORTS_DATA_IO_KEY is missing.");

  // You will copy the *exact path* from SportsDataIO’s CBB Box Scores By Date endpoint page.
  // It will look like a /v3/cbb/.../BoxScoresByDate/{date} style URL.
  const url = `${BASE}<PASTE_THE_CBB_BOX_SCORES_BY_DATE_PATH_HERE_AND_REPLACE_{date}>`
    .replace("{date}", date);

  const res = await fetch(url, {
    headers: {
      // SportsDataIO shows the required header name in their docs UI
      "Ocp-Apim-Subscription-Key": KEY,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SportsDataIO error ${res.status}: ${txt}`);
  }

  return res.json();
}

export async function POST() {
  try {
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const dates = [ymd(today), ymd(yesterday)];

    let updatedGames = 0;
    let finalsSeen = 0;

    for (const date of dates) {
      const boxScores = await fetchBoxScoresByDate(date);

      // boxScores is typically an array of games with nested info.
      // In SportsDataIO, games have a Status and scores; finals are "Final".
      for (const g of boxScores ?? []) {
        // Adjust these fields to match SportsDataIO’s exact JSON keys from the endpoint response
        const status = g?.Status ?? g?.status;
        if (status !== "Final") continue;

        finalsSeen++;

        const sportsdataGameId = g?.GameID ?? g?.GameId ?? g?.gameId;
        const homeTeamId = g?.HomeTeamID ?? g?.homeTeamId;
        const awayTeamId = g?.AwayTeamID ?? g?.awayTeamId;
        const homeScore = g?.HomeTeamScore ?? g?.homeScore;
        const awayScore = g?.AwayTeamScore ?? g?.awayScore;

        if (!sportsdataGameId || homeScore == null || awayScore == null) continue;

        // 1) Find your game row
        const { data: gameRow, error: gameFindErr } = await supabaseAdmin
          .from("games")
          .select("id,team1_id,team2_id")
          .eq("sportsdata_game_id", sportsdataGameId)
          .maybeSingle();

        if (gameFindErr) throw gameFindErr;
        if (!gameRow) continue; // if you haven't linked this game yet

        // 2) Determine winner team_id in YOUR DB
        // If you store sportsdata_team_id on your teams table, map homeTeamId/awayTeamId -> your team ids
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

        // 3) Update winner
        const { error: updErr } = await supabaseAdmin
          .from("games")
          .update({ winner_team_id: winnerLocalId })
          .eq("id", gameRow.id);

        if (updErr) throw updErr;

        updatedGames++;
      }
    }

    return NextResponse.json({
      ok: true,
      dates,
      finalsSeen,
      updatedGames,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

