import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { applyCbbResearchRows } from "@/lib/cbbProjectionResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApplyBody = {
  sourceRows?: unknown;
};

export async function POST(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as ApplyBody;
  if (!Array.isArray(body.sourceRows)) {
    return NextResponse.json({ error: "sourceRows must be an array" }, { status: 400 });
  }

  const sourceRows = body.sourceRows
    .map((row) => (typeof row === "number" ? row : Number(row)))
    .filter((row) => Number.isInteger(row) && row > 0);

  if (sourceRows.length === 0) {
    return NextResponse.json({ error: "select at least one researched player" }, { status: 400 });
  }

  const result = await applyCbbResearchRows(sourceRows);
  return NextResponse.json({
    appliedRows: result.appliedRows,
    missingRows: result.missingRows,
    projections: result.projections,
    research: result.research,
  });
}
