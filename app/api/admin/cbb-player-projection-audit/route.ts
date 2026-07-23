import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { readCbbProjectionAudit } from "@/lib/cbbProjectionResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth.response;

  const audit = await readCbbProjectionAudit();
  return NextResponse.json(audit);
}
