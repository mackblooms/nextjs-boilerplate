import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { hashPoolPassword } from "@/lib/poolPassword";

type CreatePoolRequest = {
  name?: string;
  password?: string;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function getAuthUserIdFromToken(token: string, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  return supabaseAdmin.auth.getUser(token);
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const { data: authData, error: authErr } = await getAuthUserIdFromToken(token, supabaseAdmin);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as CreatePoolRequest;
    const poolName = body.name?.trim() ?? "";
    const password = body.password ?? "";

    if (!poolName) {
      return NextResponse.json({ error: "Pool name is required." }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ error: "Pool password must be at least 4 characters." }, { status: 400 });
    }

    const joinPasswordHash = hashPoolPassword(password);

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .insert({
        name: poolName,
        created_by: authData.user.id,
        is_private: true,
        join_password_hash: joinPasswordHash,
      })
      .select("id")
      .single();

    if (poolErr || !poolRow) {
      return NextResponse.json(
        { error: poolErr?.message ?? "Failed to create pool." },
        { status: 400 },
      );
    }

    const { error: joinErr } = await supabaseAdmin.from("pool_members").insert({
      pool_id: poolRow.id,
      user_id: authData.user.id,
    });

    if (joinErr) {
      return NextResponse.json(
        { error: joinErr.message ?? "Pool created, but failed to join the creator." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, poolId: poolRow.id });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
