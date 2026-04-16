import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { computeAutoProjectionByName } from "@/lib/playerProjectionData";

export async function GET(req: Request) {
  const auth = await requireSiteAdmin(req);
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "Missing player name." }, { status: 400 });
  }

  const result = await computeAutoProjectionByName(name);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json(result);
}
