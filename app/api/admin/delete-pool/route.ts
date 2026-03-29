import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireSiteAdmin } from "@/lib/adminAuth";

type EntryIdRow = { id: string };
type DeletePoolRequest = { poolId?: string };

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
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const body = (await req.json().catch(() => ({}))) as DeletePoolRequest;
    const poolId = body.poolId?.trim();

    if (!poolId) {
      return NextResponse.json({ error: "missing poolId" }, { status: 400 });
    }

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("id,created_by")
      .eq("id", poolId)
      .maybeSingle();

    if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 400 });
    if (!poolRow) return NextResponse.json({ error: "pool not found" }, { status: 404 });

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
