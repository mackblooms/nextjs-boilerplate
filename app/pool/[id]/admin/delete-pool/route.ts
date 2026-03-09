import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type EntryIdRow = { id: string };
type DeletePoolRequest = { poolId?: string; userId?: string };

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

async function isPoolCommissioner(userId: string, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabaseAdmin
    .from("pools")
    .select("id")
    .eq("created_by", userId)
    .limit(1);

  if (error) return false;
  return (data ?? []).length > 0;
}

function getBlockingTableName(errorMessage: string): string | null {
  // Example: ... violates foreign key constraint ... on table "some_table"
  const match = errorMessage.match(/on table "([^"]+)"/i);
  if (!match?.[1]) return null;
  return match[1];
}

async function deleteEntriesForPool(poolId: string, supabaseAdmin: ReturnType<typeof getSupabaseAdmin>) {
  const { data: entryRows, error: entryLoadErr } = await supabaseAdmin
    .from("entries")
    .select("id")
    .eq("pool_id", poolId);

  if (entryLoadErr) return { error: entryLoadErr, deletedEntries: 0 };

  const entryIds = ((entryRows ?? []) as EntryIdRow[]).map((e) => e.id);

  if (entryIds.length > 0) {
    const { error: picksDeleteErr } = await supabaseAdmin
      .from("entry_picks")
      .delete()
      .in("entry_id", entryIds);

    if (picksDeleteErr) return { error: picksDeleteErr, deletedEntries: 0 };

    const { error: entriesDeleteErr } = await supabaseAdmin
      .from("entries")
      .delete()
      .in("id", entryIds);

    if (entriesDeleteErr) return { error: entriesDeleteErr, deletedEntries: 0 };
  }

  return { error: null, deletedEntries: entryIds.length };
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const body = (await req.json().catch(() => ({}))) as DeletePoolRequest;
    const poolId = body.poolId?.trim();
    const fallbackUserId = body.userId?.trim();

    if (!poolId) {
      return NextResponse.json({ error: "missing poolId" }, { status: 400 });
    }

    const token = getBearerToken(req);
    let requesterUserId: string | null = null;

    if (token) {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !authData.user) {
        return NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 });
      }
      requesterUserId = authData.user.id;
    } else if (fallbackUserId) {
      // Backward compatibility for older clients while routes migrate to bearer auth.
      requesterUserId = fallbackUserId;
    }

    if (!requesterUserId) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("id,created_by")
      .eq("id", poolId)
      .maybeSingle();

    if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 400 });
    if (!poolRow) return NextResponse.json({ error: "pool not found" }, { status: 404 });

    const isPoolCreator = poolRow.created_by === requesterUserId;
    const isSiteAdmin = getSiteAdminUserIds().has(requesterUserId);
    const isCommissioner = await isPoolCommissioner(requesterUserId, supabaseAdmin);

    if (!isPoolCreator && !isSiteAdmin && !isCommissioner) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    const entryDeleteResult = await deleteEntriesForPool(poolId, supabaseAdmin);
    if (entryDeleteResult.error) {
      return NextResponse.json({ error: entryDeleteResult.error.message }, { status: 400 });
    }

    const { error: membersDeleteErr } = await supabaseAdmin
      .from("pool_members")
      .delete()
      .eq("pool_id", poolId);

    if (membersDeleteErr) return NextResponse.json({ error: membersDeleteErr.message }, { status: 400 });

    const autoCleanedTables: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const { error: poolDeleteErr } = await supabaseAdmin
        .from("pools")
        .delete()
        .eq("id", poolId);

      if (!poolDeleteErr) {
        return NextResponse.json({
          ok: true,
          deletedEntries: entryDeleteResult.deletedEntries,
          cleanedTables: autoCleanedTables,
        });
      }

      const blockingTable = getBlockingTableName(poolDeleteErr.message ?? "");
      if (!blockingTable || blockingTable === "pools") {
        return NextResponse.json({ error: poolDeleteErr.message }, { status: 400 });
      }

      const { error: blockingRowsDeleteErr } = await supabaseAdmin
        .from(blockingTable)
        .delete()
        .eq("pool_id", poolId);

      if (blockingRowsDeleteErr) {
        return NextResponse.json(
          {
            error: `${poolDeleteErr.message}; cleanup failed for ${blockingTable}: ${blockingRowsDeleteErr.message}`,
          },
          { status: 400 }
        );
      }

      autoCleanedTables.push(blockingTable);
    }

    return NextResponse.json({ error: "Failed to delete pool after dependency cleanup retries." }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
