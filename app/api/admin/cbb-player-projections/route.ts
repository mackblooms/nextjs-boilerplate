import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import projections from "@/data/cbb/player-projections.json";
import type { CbbProjectionPayload } from "@/lib/cbbPlayerProjections";

export async function GET(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth.response;

  return NextResponse.json(projections as CbbProjectionPayload);
}
