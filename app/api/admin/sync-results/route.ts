import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase (service role)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function assertEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required.`);
  return v;
}

type HighlightlyGame = {
  id: string | number;
  status?: string;
  start_time?: string; // or "date" depending on API
  home_team_id?: string | number;
  away_team_id?: string | number;
  winner_team_id?: string | number | null;
  // OR scores like home_score/away_score, etc.
};

export async function POST(req: Request) {
  try {
    // --- Protect the route (cron secret) ---
    const cronSecret = assertEnv("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // --- RapidAPI auth ---
    const RAPIDAPI_KEY = assertEnv("RAPIDAPI_KEY");
    const HIGHLIGHTLY_HOST = assertEnv("HIGHLIGHTLY_HOST");

    // You can pass dates in the body so you only fetch “today”
    const body = await req.json().catch(() => ({}));
    const date = body.date ?? new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // TODO: Replace this URL with the actual Highlightly endpoint you’re using.
    // Example format only:
    const url = `https://${HIGHLIGHTLY_HOST}/YOUR_ENDPOINT_HERE?date=${encodeURIComponent(date)}&league=NCAAB`;

    const r = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": HIGHLIGHTLY_HOST,
      },
      cache: "no-store",
    });

    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json(
        { error: `Highlightly error: ${r.status}`, detail: txt },
        { status: 500 }
      );
    }

    const payload = await r.json();

    // TODO: Adjust this depending on Highlightly’s response shape
    const games: HighlightlyGame[] = payload?.games ?? payload?.data ?? [];

    // Only completed/finished games
    const finished = games.filter((g) => {
      const s = (g.status ?? "").toLowerCase();
      return s === "final" || s === "finished" || s === "completed";
    });

    let updated = 0;
    let skipped = 0;

    for (const g of finished) {
      const externalId = String(g.id);

      // Find our game row by external_game_id
      const { data: dbGame, error: findErr } = await supabaseAdmin
        .from("games")
        .select("id, winner_team_id, external_game_id")
        .eq("external_game_id", externalId)
        .maybeSingle();

      if (findErr) throw findErr;
      if (!dbGame) {
        skipped++;
        continue;
      }

      // Determine the winner in YOUR schema (winner_team_id should be your teams.id uuid)
      // Best option: map highlightly winner team -> teams.external_team_id -> teams.id
      let winnerTeamId: string | null = null;

      if (g.winner_team_id != null) {
        const externalWinnerTeamId = String(g.winner_team_id);
        const { data: teamRow, error: teamErr } = await supabaseAdmin
          .from("teams")
          .select("id")
          .eq("external_team_id", externalWinnerTeamId)
          .maybeSingle();
        if (teamErr) throw teamErr;
        winnerTeamId = teamRow?.id ?? null;
      } else {
        // If Highlightly gives scores instead, compute winner here.
        winnerTeamId = null;
      }

      // If no winner resolved, don’t overwrite
      if (!winnerTeamId) {
        skipped++;
        continue;
      }

      // If already set correctly, skip
      if (dbGame.winner_team_id === winnerTeamId) {
        skipped++;
        continue;
      }

      const { error: updErr } = await supabaseAdmin
        .from("games")
        .update({
          winner_team_id: winnerTeamId,
          status: "final",
        })
        .eq("id", dbGame.id);

      if (updErr) throw updErr;
      updated++;
    }

    // OPTIONAL: call a scoring RPC after updating winners
    // If you already have one, call it here:
    // await supabaseAdmin.rpc("recalculate_pool_scores");

    return NextResponse.json({ ok: true, date, updated, skipped });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
