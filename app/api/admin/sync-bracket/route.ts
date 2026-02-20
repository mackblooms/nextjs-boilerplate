import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const KEY = process.env.SPORTS_DATA_IO_KEY;
const BASE = "https://api.sportsdata.io";

// ✅ fetch helper that NEVER crashes on empty body
async function fetchJsonOrEmpty(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text(); // may be empty

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    contentType: res.headers.get("content-type") ?? "",
    contentLength: Number(res.headers.get("content-length") ?? "0"),
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

async function runSyncBracket() {
  if (!KEY) throw new Error("SPORTS_DATA_IO_KEY is missing");

  // ✅ change later if needed
  const season = 2026;

  // Use the same style you confirmed works in your browser (querystring key)
  const url = `${BASE}/v3/cbb/scores/json/Tournament/${season}?key=${KEY}`;

  const resp = await fetchJsonOrEmpty(url);

  // Pre-release: SportsDataIO may return 200 with empty body — treat as "not ready yet"
  if (resp.ok && (!resp.body || !resp.body.trim())) {
    return {
      season,
      url,
      status: resp.status,
      note: "Tournament data not available yet (empty response body).",
    };
  }

  // If API returns an error code, surface details
  if (!resp.ok) {
    throw new Error(
      `SportsDataIO ${resp.status} ${resp.statusText}\nURL: ${url}\nBody:\n${resp.body || "(empty)"}`
    );
  }

  // If it returned something but it's not JSON, surface snippet
  if (!resp.json) {
    throw new Error(
      `SportsDataIO returned non-JSON.\nURL: ${url}\nFirst 500 chars:\n${(resp.body || "").slice(
        0,
        500
      )}`
    );
  }

  // SportsDataIO may return either an array of games or an object that contains games.
  const raw = resp.json as any;

  const gamesArray =
    Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.Games)
      ? raw.Games
      : Array.isArray(raw?.games)
      ? raw.games
      : null;

  // If JSON exists but we can't find games yet, return shape info
  if (!gamesArray) {
    return {
      season,
      url,
      status: resp.status,
      note:
        "Tournament returned JSON, but we couldn't find a games array yet. We'll adjust once we see the shape.",
      receivedType: Array.isArray(raw) ? "array" : typeof raw,
      sampleKeys:
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? Object.keys(raw).slice(0, 40)
          : null,
    };
  }

  // ✅ Linking logic (will only matter once bracket data exists)
  const supabaseAdmin = getSupabaseAdmin();

  const norm = (s: any) => String(s ?? "").trim().toLowerCase();

  const bracketToRegion = (bracket: any) => {
    const b = norm(bracket);
    if (b.includes("east")) return "East";
    if (b.includes("west")) return "West";
    if (b.includes("south")) return "South";
    if (b.includes("midwest")) return "Midwest";
    return null;
  };

  // Conservative mapping — we’ll adjust once we see the real Tournament payload for 2026.
  const roundToCode = (round: any) => {
    const r = Number(round);
    if (Number.isNaN(r)) return null;
    if (r === 0) return "S16";
    if (r === 1) return "E8";
    if (r === 2) return "F4";
    if (r === 3) return "CHIP";
    return null;
  };

  let linked = 0;
  let skippedNoMap = 0;

  for (const g of gamesArray) {
    const gameId = g?.GameID ?? g?.GameId ?? g?.gameId;
    const bracket = g?.Bracket ?? g?.bracket;
    const round = g?.Round ?? g?.round;

    const region = bracketToRegion(bracket);
    const roundCode = roundToCode(round);

    const slot =
      g?.TournamentDisplayOrder ??
      g?.Slot ??
      g?.slot ??
      null;

    if (!gameId || !region || !roundCode || !slot) {
      skippedNoMap++;
      continue;
    }

    const { data: ourGame, error: findErr } = await supabaseAdmin
      .from("games")
      .select("id,sportsdata_game_id")
      .eq("round", roundCode)
      .eq("region", region)
      .eq("slot", slot)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!ourGame) continue;

    if (ourGame.sportsdata_game_id !== gameId) {
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
  }

  return {
    season,
    url,
    status: resp.status,
    note: "Linked games where round/region/slot mapping was possible.",
    totalGamesInPayload: gamesArray.length,
    linked,
    skippedNoMap,
    sampleGame: gamesArray[0] ?? null,
  };
}

export async function GET() {
  try {
    const result = await runSyncBracket();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}