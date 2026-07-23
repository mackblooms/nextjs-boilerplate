import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { removeCbbDuplicatePlayerRow } from "@/lib/cbbProjectionResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RemoveDuplicateBody = {
  sourceRow?: unknown;
};

export async function POST(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth.response;

  const body = (await req.json().catch(() => ({}))) as RemoveDuplicateBody;
  const sourceRow = typeof body.sourceRow === "number" ? body.sourceRow : Number(body.sourceRow);

  if (!Number.isInteger(sourceRow) || sourceRow <= 0) {
    return NextResponse.json({ error: "sourceRow must be a positive integer" }, { status: 400 });
  }

  const result = await removeCbbDuplicatePlayerRow(sourceRow);
  if (!result.removedPlayer) {
    return NextResponse.json({ error: `No player found for source row ${sourceRow}` }, { status: 404 });
  }

  return NextResponse.json(result);
}
