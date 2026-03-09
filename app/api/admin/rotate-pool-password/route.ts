import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashPoolPassword } from "@/lib/poolPassword";
import { encryptPoolPassword } from "@/lib/poolPasswordVault";

function isMissingCiphertextColumnError(message: string | undefined): boolean {
  return Boolean(message && message.includes("join_password_ciphertext"));
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const body = await req.json().catch(() => ({}));
    const poolId = body.poolId as string | undefined;
    const userId = body.userId as string | undefined;
    const password = body.password as string | undefined;

    if (!poolId || !userId || !password) {
      return NextResponse.json({ error: "missing poolId/userId/password" }, { status: 400 });
    }

    const nextPassword = password.trim();
    if (nextPassword.length < 4) {
      return NextResponse.json({ error: "password must be at least 4 characters" }, { status: 400 });
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

    const passwordHash = hashPoolPassword(nextPassword);
    const passwordCiphertext = encryptPoolPassword(nextPassword);

    const { error: updateErr } = await supabaseAdmin
      .from("pools")
      .update({
        is_private: true,
        join_password_hash: passwordHash,
        join_password_ciphertext: passwordCiphertext,
      })
      .eq("id", poolId);

    if (updateErr) {
      if (isMissingCiphertextColumnError(updateErr.message)) {
        return NextResponse.json(
          {
            error:
              "Pool password storage is not fully migrated. Run db/migrations/20260309_pool_password_ciphertext.sql.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
