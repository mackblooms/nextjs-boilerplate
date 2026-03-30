import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { decryptPoolPassword } from "@/lib/poolPasswordVault";

type PoolPasswordRequest = {
  poolIds?: string[];
};

type PoolRow = {
  id: string;
  created_by: string;
  join_password_ciphertext: string | null;
};

function isMissingCiphertextColumnError(message: string | undefined): boolean {
  return Boolean(message && message.includes("join_password_ciphertext"));
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const body = (await req.json().catch(() => ({}))) as PoolPasswordRequest;
    const requestedPoolIds = Array.isArray(body.poolIds)
      ? Array.from(
          new Set(
            body.poolIds
              .map((id) => String(id ?? "").trim())
              .filter(Boolean)
          )
        )
      : [];

    if (requestedPoolIds.length === 0) {
      return NextResponse.json({ ok: true, passwords: {} });
    }
    const { data: poolRows, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("id,created_by,join_password_ciphertext")
      .in("id", requestedPoolIds);

    if (poolErr) {
      if (isMissingCiphertextColumnError(poolErr.message)) {
        return NextResponse.json(
          {
            error:
              "Pool password storage is not fully migrated. Run db/migrations/20260309_pool_password_ciphertext.sql.",
          },
          { status: 500 }
        );
      }

      return NextResponse.json({ error: poolErr.message }, { status: 400 });
    }

    const byId = new Map<string, PoolRow>();
    for (const row of (poolRows ?? []) as PoolRow[]) {
      byId.set(row.id, row);
    }

    const passwords: Record<string, string | null> = {};
    for (const poolId of requestedPoolIds) {
      const row = byId.get(poolId);
      if (!row) {
        passwords[poolId] = null;
        continue;
      }

      passwords[poolId] = decryptPoolPassword(row.join_password_ciphertext);
    }

    return NextResponse.json({ ok: true, passwords });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
