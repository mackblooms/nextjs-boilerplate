import { NextResponse } from "next/server";
import { normalizeCompetitionSlug } from "@/lib/competitions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { withWorldCupDraftCost } from "@/lib/worldCupRules";

function isMissingColumnError(error: { message?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  return message.includes("column") && message.includes("does not exist");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const competitionSlug = normalizeCompetitionSlug(url.searchParams.get("competition"));

    const supabaseAdmin = getSupabaseAdmin();

    const teamsBaseQuery = supabaseAdmin
      .from("teams")
      .select("id,name,region,seed,seed_in_region,cost,logo_url,espn_team_id");
    let { data: teamRows, error: teamErr } = await (
      competitionSlug === "world-cup"
        ? teamsBaseQuery.eq("competition_slug", "world-cup")
        : teamsBaseQuery.or("competition_slug.eq.march-madness,competition_slug.is.null")
    );

    if (teamErr && isMissingColumnError(teamErr)) {
      const fallback = await supabaseAdmin
        .from("teams")
        .select("id,name,region,seed,seed_in_region,cost,logo_url,espn_team_id");
      teamRows = fallback.data;
      teamErr = fallback.error;
    }

    if (teamErr) {
      return NextResponse.json({ error: teamErr.message }, { status: 400 });
    }

    const fullGameFields =
      "id,round,region,slot,status,start_time,game_date,team1_id,team2_id,winner_team_id,sportsdata_game_id,team1_score,team2_score";
    const fallbackGameFields =
      "id,round,region,slot,team1_id,team2_id,winner_team_id,sportsdata_game_id";
    const gamesBaseQuery = supabaseAdmin.from("games").select(fullGameFields);
    let { data: gameRows, error: gameErr } = await (
      competitionSlug === "world-cup"
        ? gamesBaseQuery.eq("competition_slug", "world-cup")
        : gamesBaseQuery.or("competition_slug.eq.march-madness,competition_slug.is.null")
    );

    if (gameErr && isMissingColumnError(gameErr)) {
      const fallbackBaseQuery = supabaseAdmin.from("games").select(fallbackGameFields);
      const fallback = await (
        competitionSlug === "world-cup"
          ? fallbackBaseQuery.eq("competition_slug", "world-cup")
          : fallbackBaseQuery.or("competition_slug.eq.march-madness,competition_slug.is.null")
      );
      gameRows = (fallback.data ?? []).map((row) => ({
        ...row,
        status: null,
        start_time: null,
        game_date: null,
        team1_score: null,
        team2_score: null,
      }));
      gameErr = fallback.error;
    }

    if (gameErr) {
      return NextResponse.json({ error: gameErr.message }, { status: 400 });
    }

    const teams =
      competitionSlug === "world-cup"
        ? (teamRows ?? []).map((team) => withWorldCupDraftCost(team))
        : teamRows ?? [];

    return NextResponse.json({
      ok: true,
      competition: competitionSlug,
      teams,
      games: ((gameRows ?? []) as Array<{ slot: number | string | null }>).map((game) => ({
        ...game,
        slot: Number(game.slot ?? 0),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load competition data." },
      { status: 500 },
    );
  }
}
