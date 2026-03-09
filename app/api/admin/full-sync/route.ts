import { NextResponse } from "next/server";

async function callJson(url: string, options: RequestInit) {
  const res = await fetch(url, { ...options, cache: "no-store" });
  const text = await res.text();

  let json: unknown = null;
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

function toSeason(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const year = Math.trunc(n);
  if (year < 2000 || year > 2100) return null;
  return year;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function countField(value: unknown, field: string): number {
  const obj = asObject(value);
  const n = Number(obj[field]);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: Request) {
  try {
    const origin = new URL(req.url).origin;
    const querySeason = toSeason(new URL(req.url).searchParams.get("season"));

    let bodySeason: number | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        bodySeason = toSeason(body?.season);
      } catch {
        // Allow empty body.
      }
    }

    const season = bodySeason ?? querySeason;
    const syncBody = season ? JSON.stringify({ season }) : "{}";

    const passSummaries: Array<{
      pass: number;
      linked: number;
      alreadyLinked: number;
      skippedNoMap: number;
      updatedWinners: number;
      finalsSeen: number;
    }> = [];

    let bracketRes: unknown = null;
    let scoresRes: unknown = null;
    let totalLinked = 0;
    let totalUpdatedWinners = 0;

    const MAX_PASSES = 8;
    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      bracketRes = await callJson(`${origin}/api/admin/sync-bracket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: syncBody,
      });

      scoresRes = await callJson(`${origin}/api/admin/sync-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: syncBody,
      });

      const linked = countField(bracketRes, "linked");
      const alreadyLinked = countField(bracketRes, "alreadyLinked");
      const skippedNoMap = countField(bracketRes, "skippedNoMap");
      const updatedWinners = countField(scoresRes, "updatedGames");
      const finalsSeen = countField(scoresRes, "finalsSeen");

      passSummaries.push({
        pass,
        linked,
        alreadyLinked,
        skippedNoMap,
        updatedWinners,
        finalsSeen,
      });

      totalLinked += linked;
      totalUpdatedWinners += updatedWinners;

      if (linked === 0 && updatedWinners === 0) break;
    }

    return NextResponse.json({
      ok: true,
      season: season ?? null,
      bracket: bracketRes,
      scores: scoresRes,
      passCount: passSummaries.length,
      passes: passSummaries,
      totals: {
        linked: totalLinked,
        updatedWinners: totalUpdatedWinners,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
