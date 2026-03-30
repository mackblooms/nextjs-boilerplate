import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";

export async function GET(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) {
    return NextResponse.json({ isSiteAdmin: false }, { status: auth.response.status });
  }

  return NextResponse.json({ isSiteAdmin: true, userId: auth.userId });
}
