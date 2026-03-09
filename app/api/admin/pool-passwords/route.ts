import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
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

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function getSiteAdminUserIds(): Set<string> {
  const raw =
    process.env.POOL_SITE_ADMIN_USER_IDS ??
    process.env.POOL_ADMIN_USER_IDS ??
    process.env.ADMIN_USER_IDS ??
    "";

  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 });
    }

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

    const requesterUserId = authData.user.id;
    const isSiteAdmin = getSiteAdminUserIds().has(requesterUserId);

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

      if (!isSiteAdmin && row.created_by !== requesterUserId) {
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
