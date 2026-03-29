import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSiteAdmin } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const body = await req.json().catch(() => ({}));
    const poolId = body.poolId as string | undefined;
    const name = body.name as string | undefined;

    if (!poolId || !name) {
      return NextResponse.json({ error: "missing poolId/name" }, { status: 400 });
    }

    const nextName = name.trim();
    if (!nextName) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
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
