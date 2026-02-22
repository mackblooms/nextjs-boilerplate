import { NextResponse } from "next/server";

async function callJson(url: string, options: RequestInit) {
  const res = await fetch(url, { ...options, cache: "no-store" });
  const text = await res.text();

  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    throw new Error(
      `Call failed: ${url}\nStatus: ${res.status}\nBody:\n${text || "(empty)"}`
    );
  }

  return json;
}

export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;

    // 1) Import schedule
    const importRes = await callJson(`${origin}/api/admin/import-schedule`, {
      method: "POST",
    });

    // 2) Link games
    const linkRes = await callJson(`${origin}/api/admin/link-games`, {
      method: "POST",
    });

    // 3) Sync scores
    const scoresRes = await callJson(`${origin}/api/admin/sync-scores`, {
      method: "POST",
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

export async function GET(req: Request) {
  return POST(req);
}