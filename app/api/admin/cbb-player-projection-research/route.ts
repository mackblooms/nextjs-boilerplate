import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import {
  buildCbbResearchPayload,
  readCbbProjections,
  readCbbResearchBatches,
} from "@/lib/cbbProjectionResearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth.response;

  const [batches, projections] = await Promise.all([readCbbResearchBatches(), readCbbProjections()]);
  return NextResponse.json(buildCbbResearchPayload(batches, projections));
}
