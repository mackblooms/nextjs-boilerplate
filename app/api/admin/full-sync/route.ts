import { NextResponse } from "next/server";

const SECRET = process.env.ADMIN_SYNC_SECRET;

async function callJson(url: string, options: RequestInit) {
  const res = await fetch(url, { ...options, cache: "no-store" });
  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep json as null
  }

  if (!res.ok) {
    throw new Error(
      `Call failed: ${url}\nStatus: ${res.status}\nBody:\n${text || "(empty)"}`
    );
  }

  return json;
}

export async function POST(req: Request) {
  try {
    if (!SECRET) throw new Error("ADMIN_SYNC_SECRET is missing.");

    const got = req.headers.get("x-admin-sync-secret");
    if (got !== SECRET) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Build absolute origin like http://localhost:3000 or https://yourvercel.app
    const origin = new URL(req.url).origin;
    const headers = { "x-admin-sync-secret": SECRET };

    // 1) Import schedule (bracket structure / team assignments)
    const importRes = await callJson(`${origin}/api/admin/import-schedule`, {
      method: "POST",
      headers,
    });

    // 2) Link games (fills games.sportsdata_game_id)
    const linkRes = await callJson(`${origin}/api/admin/link-games`, {
      method: "POST",
      headers,
    });

    // 3) Sync scores (sets winners + advances + scoring)
    const scoresRes = await callJson(`${origin}/api/admin/sync-scores`, {
      method: "POST",
      headers,
    });

    return NextResponse.json({
      ok: true,
      import: importRes,
      link: linkRes,
      scores: scoresRes,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

// Optional: allow GET for easy browser testing
export async function GET(req: Request) {
  return POST(req);
}