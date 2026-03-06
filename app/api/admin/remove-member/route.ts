import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type EntryIdRow = { id: string };

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const body = await req.json().catch(() => ({}));
    const poolId = body.poolId as string | undefined;
    const userId = body.userId as string | undefined;
    const targetUserId = body.targetUserId as string | undefined;

    if (!poolId || !userId || !targetUserId) {
      return NextResponse.json({ error: "missing poolId/userId/targetUserId" }, { status: 400 });
    }

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("created_by")
      .eq("id", poolId)
      .single();

    if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 400 });
    if (poolRow.created_by !== userId) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    if (targetUserId === userId) {
      return NextResponse.json({ error: "cannot remove pool creator" }, { status: 400 });
    }

    const { data: entryRows, error: entryLoadErr } = await supabaseAdmin
      .from("entries")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", targetUserId);

    if (entryLoadErr) return NextResponse.json({ error: entryLoadErr.message }, { status: 400 });

    const entryIds = ((entryRows ?? []) as EntryIdRow[]).map((e) => e.id);

    if (entryIds.length > 0) {
      const { error: picksDeleteErr } = await supabaseAdmin
        .from("entry_picks")
        .delete()
        .in("entry_id", entryIds);

      if (picksDeleteErr) return NextResponse.json({ error: picksDeleteErr.message }, { status: 400 });

      const { error: entriesDeleteErr } = await supabaseAdmin
        .from("entries")
        .delete()
        .in("id", entryIds);

      if (entriesDeleteErr) return NextResponse.json({ error: entriesDeleteErr.message }, { status: 400 });
    }

    const { error: membershipDeleteErr } = await supabaseAdmin
      .from("pool_members")
      .delete()
      .eq("pool_id", poolId)
      .eq("user_id", targetUserId);

    if (membershipDeleteErr) return NextResponse.json({ error: membershipDeleteErr.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
