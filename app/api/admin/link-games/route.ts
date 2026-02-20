import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const KEY = process.env.SPORTS_DATA_IO_KEY;
const BASE = "https://api.sportsdata.io";

async function fetchGamesFinalByDate(date: string) {
  if (!KEY) throw new Error("SPORTS_DATA_IO_KEY is missing");

  // SportsDataIO CBB GamesByDateFinal endpoint (per your screenshot)
  const url = `${BASE}/v3/cbb/scores/json/GamesByDateFinal/${date}`;

  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SportsDataIO error ${res.status}: ${txt}`);
  }

  return res.json();
}

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Pull your unlinked games that have a date + teams
    const { data: localGames, error } = await supabaseAdmin
      .from("games")
      .select("id,game_date,team1_id,team2_id")
      .is("sportsdata_game_id", null)
      .not("game_date", "is", null)
      .not("team1_id", "is", null)
      .not("team2_id", "is", null);

    if (error) throw error;

    if (!localGames || localGames.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No games to link (need game_date + team1_id + team2_id).",
      });
    }

    // Build a map from your team UUID -> sportsdata_team_id
    const teamIds = Array.from(
      new Set(localGames.flatMap((g: any) => [g.team1_id, g.team2_id]))
    );

    const { data: teams, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id,sportsdata_team_id")
      .in("id", teamIds);

    if (teamErr) throw teamErr;

    const localToSports = new Map<string, number>();
    for (const t of teams ?? []) {
      if (t.sportsdata_team_id != null) localToSports.set(t.id, t.sportsdata_team_id);
    }

    // Group local games by date (so we only call SportsDataIO once per date)
    const byDate = new Map<string, any[]>();
    for (const g of localGames) {
      const d = g.game_date; // comes back as YYYY-MM-DD
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(g);
    }

    let linked = 0;
    let notFound = 0;

    for (const [date, gamesForDate] of byDate.entries()) {
      const apiGames = await fetchGamesFinalByDate(date);

      // Index API games by "homeId-awayId" and also "awayId-homeId" (just in case)
      const apiIndex = new Map<string, number>();
      for (const ag of apiGames ?? []) {
        const home = ag?.HomeTeamID;
        const away = ag?.AwayTeamID;
        const gid = ag?.GameID;
        if (!home || !away || !gid) continue;
        apiIndex.set(`${home}-${away}`, gid);
        apiIndex.set(`${away}-${home}`, gid);
      }

      for (const lg of gamesForDate) {
        const s1 = localToSports.get(lg.team1_id);
        const s2 = localToSports.get(lg.team2_id);
        if (!s1 || !s2) { notFound++; continue; }

        const gameId = apiIndex.get(`${s1}-${s2}`);
        if (!gameId) { notFound++; continue; }

        const { error: updErr } = await supabaseAdmin
          .from("games")
          .update({ sportsdata_game_id: gameId })
          .eq("id", lg.id);

        if (updErr) throw updErr;
        linked++;
      }
    }

    return NextResponse.json({ ok: true, linked, notFound });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
