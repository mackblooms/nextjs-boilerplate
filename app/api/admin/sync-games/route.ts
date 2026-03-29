import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required.`);
  return v;
}

type SportsDataGame = {
  GameID: number;
  Status: string;
  IsClosed: boolean;
  Day: string;
  HomeTeamID: number;
  AwayTeamID: number;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
};

function pushUniqueTeamId(target: Map<number, string[]>, externalTeamId: unknown, localTeamId: unknown) {
  const sportsId = Number(externalTeamId);
  if (!Number.isFinite(sportsId)) return;

  const localId = String(localTeamId ?? "").trim();
  if (!localId) return;

  const key = Math.trunc(sportsId);
  const existing = target.get(key) ?? [];
  if (!existing.includes(localId)) existing.push(localId);
  target.set(key, existing);
}

export async function POST(req: Request) {
  try {
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const supabase = getSupabaseAdmin();

    const { date } = await req.json(); // expects "YYYY-MMM-DD" like "2025-MAR-28"
    if (!date || typeof date !== "string") {
      return NextResponse.json({ error: "Missing { date } body param." }, { status: 400 });
    }

    const API_KEY = mustEnv("SPORTSDATAIO_KEY");

    const url = `https://api.sportsdata.io/v3/cbb/scores/json/GamesByDate/${encodeURIComponent(
      date
    )}?key=${encodeURIComponent(API_KEY)}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: `SportsDataIO error ${r.status}: ${text}` }, { status: 500 });
    }

    const games = (await r.json()) as SportsDataGame[];

    // Build map SportsDataTeamID -> our teams.id
    const { data: teamRows, error: teamErr } = await supabase
      .from("teams")
      .select("id,sportsdata_team_id")
      .not("sportsdata_team_id", "is", null);

    if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 500 });

    const ourTeamIdsBySportsId = new Map<number, string[]>();
    for (const t of teamRows ?? []) {
      pushUniqueTeamId(ourTeamIdsBySportsId, t.sportsdata_team_id, t.id);
    }

    let linked = 0;
    let winnersSet = 0;
    let skippedNoMatch = 0;
    let skippedTieOrNoScore = 0;

    for (const g of games) {
      const ourHomeIds = ourTeamIdsBySportsId.get(g.HomeTeamID) ?? [];
      const ourAwayIds = ourTeamIdsBySportsId.get(g.AwayTeamID) ?? [];
      if (ourHomeIds.length === 0 || ourAwayIds.length === 0) {
        skippedNoMatch++;
        continue;
      }

      const candidateMatchers: string[] = [];
      for (const ourHome of ourHomeIds) {
        for (const ourAway of ourAwayIds) {
          if (ourHome === ourAway) continue;
          candidateMatchers.push(`and(team1_id.eq.${ourHome},team2_id.eq.${ourAway})`);
          candidateMatchers.push(`and(team1_id.eq.${ourAway},team2_id.eq.${ourHome})`);
        }
      }

      if (candidateMatchers.length === 0) {
        skippedNoMatch++;
        continue;
      }

      const { data: gameMatches, error: ourGameErr } = await supabase
        .from("games")
        .select("id,team1_id,team2_id,winner_team_id,sportsdata_game_id")
        .or(candidateMatchers.join(","))
        .limit(2);

      if (ourGameErr) continue;
      if ((gameMatches?.length ?? 0) !== 1) {
        skippedNoMatch++;
        continue;
      }

      const ourGame = gameMatches?.[0];
      if (!ourGame) {
        skippedNoMatch++;
        continue;
      }

      // Always store sportsdata_game_id if missing
      if (!ourGame.sportsdata_game_id || ourGame.sportsdata_game_id !== g.GameID) {
        await supabase
          .from("games")
          .update({ sportsdata_game_id: g.GameID, last_synced_at: new Date().toISOString() })
          .eq("id", ourGame.id);
        linked++;
      }

      // If final/closed, set winner (but only if scores are usable)
      const hs = g.HomeTeamScore;
      const as = g.AwayTeamScore;

      if (g.IsClosed && typeof hs === "number" && typeof as === "number") {
        if (hs === as) {
          // Shouldn't happen in NCAA, but your sample object is tied (likely test/placeholder)
          skippedTieOrNoScore++;
          continue;
        }

        const homeIdSet = new Set(ourHomeIds);
        const awayIdSet = new Set(ourAwayIds);
        const resolvedHomeId =
          ourGame.team1_id && homeIdSet.has(ourGame.team1_id)
            ? ourGame.team1_id
            : ourGame.team2_id && homeIdSet.has(ourGame.team2_id)
            ? ourGame.team2_id
            : null;
        const resolvedAwayId =
          ourGame.team1_id && awayIdSet.has(ourGame.team1_id)
            ? ourGame.team1_id
            : ourGame.team2_id && awayIdSet.has(ourGame.team2_id)
            ? ourGame.team2_id
            : null;

        if (!resolvedHomeId || !resolvedAwayId || resolvedHomeId === resolvedAwayId) {
          skippedNoMatch++;
          continue;
        }

        const winnerOurTeamId = hs > as ? resolvedHomeId : resolvedAwayId;

        if (ourGame.winner_team_id !== winnerOurTeamId) {
          await supabase
            .from("games")
            .update({ winner_team_id: winnerOurTeamId, last_synced_at: new Date().toISOString() })
            .eq("id", ourGame.id);
          winnersSet++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      date,
      fetched: games.length,
      linked,
      winnersSet,
      skippedNoMatch,
      skippedTieOrNoScore,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
