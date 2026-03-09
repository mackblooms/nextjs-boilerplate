import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyPoolPassword } from "@/lib/poolPassword";

type JoinPoolRequest = {
  poolId?: string;
  password?: string;
};

type PoolJoinRow = {
  id: string;
  is_private: boolean | null;
  join_password_hash: string | null;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function isDuplicateMembershipError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("duplicate key") && message.includes("pool_members");
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

    const body = (await req.json().catch(() => ({}))) as JoinPoolRequest;
    const poolId = body.poolId?.trim() ?? "";
    const password = body.password ?? "";

    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("id,is_private,join_password_hash")
      .eq("id", poolId)
      .maybeSingle();

    if (poolErr) {
      return NextResponse.json({ error: poolErr.message }, { status: 400 });
    }

    if (!poolRow) {
      return NextResponse.json({ error: "Pool not found." }, { status: 404 });
    }

    const pool = poolRow as PoolJoinRow;
    const poolIsPrivate = pool.is_private ?? true;

    if (poolIsPrivate) {
      if (!password) {
        return NextResponse.json({ error: "Pool password is required." }, { status: 400 });
      }

      const isValidPassword = verifyPoolPassword(password, pool.join_password_hash);
      if (!isValidPassword) {
        return NextResponse.json({ error: "Incorrect pool password." }, { status: 403 });
      }
    }

    const { error: membershipErr } = await supabaseAdmin.from("pool_members").insert({
      pool_id: pool.id,
      user_id: authData.user.id,
    });

    if (membershipErr && !isDuplicateMembershipError(membershipErr)) {
      return NextResponse.json({ error: membershipErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
