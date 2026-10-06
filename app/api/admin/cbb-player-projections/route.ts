import { NextResponse } from "next/server";
import { requireSiteAdminOrLocalDev } from "@/lib/adminAuth";
import { readCbbProjections } from "@/lib/cbbProjectionResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireSiteAdminOrLocalDev(req);
  if ("response" in auth) return auth.response;

  const projections = await readCbbProjections();
  return NextResponse.json(projections);
}
