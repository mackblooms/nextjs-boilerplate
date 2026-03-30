import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSiteAdmin } from "@/lib/adminAuth";

type EntryRow = {
  id: string;
  pool_id: string;
  user_id: string;
};

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const body = await req.json().catch(() => ({}));
    const poolId = body.poolId as string | undefined;
    const targetEntryId = body.targetEntryId as string | undefined;

    if (!poolId || !targetEntryId) {
      return NextResponse.json({ error: "missing poolId/targetEntryId" }, { status: 400 });
    }

    const { data: entryRow, error: entryErr } = await supabaseAdmin
      .from("entries")
      .select("id,pool_id,user_id")
      .eq("id", targetEntryId)
      .eq("pool_id", poolId)
      .maybeSingle();

    if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 400 });
    if (!entryRow) return NextResponse.json({ error: "entry not found in this pool" }, { status: 404 });

    const typedEntry = entryRow as EntryRow;

    const { error: picksDeleteErr } = await supabaseAdmin
      .from("entry_picks")
      .delete()
      .eq("entry_id", targetEntryId);

    if (picksDeleteErr) return NextResponse.json({ error: picksDeleteErr.message }, { status: 400 });

    const { error: entryDeleteErr } = await supabaseAdmin
      .from("entries")
      .delete()
      .eq("id", targetEntryId)
      .eq("pool_id", poolId);

    if (entryDeleteErr) return NextResponse.json({ error: entryDeleteErr.message }, { status: 400 });

    return NextResponse.json({
      ok: true,
      removedEntryId: targetEntryId,
      targetUserId: typedEntry.user_id,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
