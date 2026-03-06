import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const body = await req.json().catch(() => ({}));
    const poolId = body.poolId as string | undefined;
    const userId = body.userId as string | undefined;
    const name = body.name as string | undefined;

    if (!poolId || !userId || !name) {
      return NextResponse.json({ error: "missing poolId/userId/name" }, { status: 400 });
    }

    const nextName = name.trim();
    if (!nextName) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
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

    const { error: renameErr } = await supabaseAdmin
      .from("pools")
      .update({ name: nextName })
      .eq("id", poolId);

    if (renameErr) return NextResponse.json({ error: renameErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, name: nextName });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
