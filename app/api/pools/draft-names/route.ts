import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { loadLatestPoolEntries } from "@/lib/latestPoolEntries";
import { normalizeCompetitionSlug } from "@/lib/competitions";

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function GET(req: Request) {
  try {
    const poolId = new URL(req.url).searchParams.get("poolId")?.trim() ?? "";
    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 });
    }

    const requesterId = authData.user.id;

    const { data: memberRow, error: memberErr } = await supabaseAdmin
      .from("pool_members")
      .select("pool_id")
      .eq("pool_id", poolId)
      .eq("user_id", requesterId)
      .maybeSingle();

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 400 });
    }

    if (!memberRow) {
      return NextResponse.json({ error: "Join this pool to view draft names." }, { status: 403 });
    }

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("competition_slug")
      .eq("id", poolId)
      .single();

    if (poolErr) {
      return NextResponse.json({ error: poolErr.message }, { status: 400 });
    }

    const latestEntries = await loadLatestPoolEntries(
      supabaseAdmin,
      poolId,
      normalizeCompetitionSlug(poolRow?.competition_slug),
    );
    const draftNamesByEntry = new Map<string, string>();
    for (const row of latestEntries.entries) {
      const name = row.latest_draft_name?.trim() || row.entry_name?.trim();
      if (name) draftNamesByEntry.set(row.entry_id, name);
    }

    return NextResponse.json({
      ok: true,
      draftNamesByEntry: Object.fromEntries(draftNamesByEntry),
      entries: latestEntries.entries,
      picksByEntry: Object.fromEntries(latestEntries.picksByEntry),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
