import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type EntryIdRow = { id: string };
type DeletePoolRequest = { poolId?: string };

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function getBlockingTableName(errorMessage: string): string | null {
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

  const entryIds = ((entryRows ?? []) as EntryIdRow[]).map((entry) => entry.id);

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
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as DeletePoolRequest;
    const poolId = body.poolId?.trim() ?? "";
    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("id,created_by")
      .eq("id", poolId)
      .maybeSingle();

    if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 400 });
    if (!poolRow) return NextResponse.json({ error: "Pool not found." }, { status: 404 });
    if ((poolRow as { created_by: string }).created_by !== authData.user.id) {
      return NextResponse.json({ error: "Only the pool creator can delete this pool." }, { status: 403 });
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
          { status: 400 },
        );
      }

      autoCleanedTables.push(blockingTable);
    }

    return NextResponse.json({ error: "Failed to delete pool after dependency cleanup retries." }, { status: 400 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
