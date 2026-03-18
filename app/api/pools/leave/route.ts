import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { formatDraftLockTimeET, isDraftLocked } from "@/lib/draftLock";

type LeavePoolRequest = {
  poolId?: string;
  entryIds?: string[];
};

type EntryIdRow = {
  id: string;
};

type PoolRow = {
  created_by: string;
  lock_time: string | null;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
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

    const body = (await req.json().catch(() => ({}))) as LeavePoolRequest;
    const poolId = body.poolId?.trim() ?? "";
    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const userId = authData.user.id;

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("created_by,lock_time")
      .eq("id", poolId)
      .maybeSingle();

    if (poolErr) {
      return NextResponse.json({ error: poolErr.message }, { status: 400 });
    }

    if (!poolRow) {
      return NextResponse.json({ error: "Pool not found." }, { status: 404 });
    }

    const pool = poolRow as PoolRow;
    const lockTime = pool.lock_time;
    if (isDraftLocked(lockTime)) {
      return NextResponse.json(
        { error: `Draft entries are locked for this pool (${formatDraftLockTimeET(lockTime)}).` },
        { status: 423 },
      );
    }

    const { data: entryRows, error: entryLoadErr } = await supabaseAdmin
      .from("entries")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", userId);

    if (entryLoadErr) {
      return NextResponse.json({ error: entryLoadErr.message }, { status: 400 });
    }

    const allEntryIds = ((entryRows ?? []) as EntryIdRow[]).map((row) => row.id);
    const requestedEntryIds = Array.isArray(body.entryIds)
      ? Array.from(new Set(body.entryIds.map((id) => id.trim()).filter((id) => id.length > 0)))
      : [];

    const removingSpecificEntries = requestedEntryIds.length > 0;
    const entryIds = removingSpecificEntries
      ? allEntryIds.filter((id) => requestedEntryIds.includes(id))
      : allEntryIds;

    if (removingSpecificEntries && entryIds.length === 0) {
      return NextResponse.json({ error: "No matching entries found for this pool." }, { status: 400 });
    }

    if (entryIds.length > 0) {
      const { error: picksDeleteErr } = await supabaseAdmin
        .from("entry_picks")
        .delete()
        .in("entry_id", entryIds);

      if (picksDeleteErr) {
        return NextResponse.json({ error: picksDeleteErr.message }, { status: 400 });
      }

      const { error: entriesDeleteErr } = await supabaseAdmin
        .from("entries")
        .delete()
        .in("id", entryIds);

      if (entriesDeleteErr) {
        return NextResponse.json({ error: entriesDeleteErr.message }, { status: 400 });
      }
    }

    const { data: remainingEntries, error: remainingEntriesErr } = await supabaseAdmin
      .from("entries")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", userId)
      .limit(1);

    if (remainingEntriesErr) {
      return NextResponse.json({ error: remainingEntriesErr.message }, { status: 400 });
    }

    let membershipRemoved = false;
    if ((remainingEntries ?? []).length === 0) {
      if (pool.created_by !== userId) {
        const { error: membershipDeleteErr } = await supabaseAdmin
          .from("pool_members")
          .delete()
          .eq("pool_id", poolId)
          .eq("user_id", userId);

        if (membershipDeleteErr) {
          return NextResponse.json({ error: membershipDeleteErr.message }, { status: 400 });
        }

        membershipRemoved = true;
      }
    }

    return NextResponse.json({
      ok: true,
      removedEntryIds: entryIds,
      membershipRemoved,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 }
    );
  }
}
