import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isDraftLocked, formatDraftLockTimeET } from "@/lib/draftLock";
import type { CompetitionSlug } from "@/lib/competitions";

type DraftRow = {
  id: string;
  user_id: string;
  competition_slug: string;
};

type EntryWithPool = {
  id: string;
  pool_id: string;
  pool: { lock_time: string | null; competition_slug: string } | null;
};

type EntryIdRow = { id: string };

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

    const userId = authData.user.id;
    const body = (await req.json().catch(() => ({}))) as { draftId?: string };
    const draftId = body.draftId?.trim() ?? "";
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required." }, { status: 400 });
    }

    const { data: draftRow, error: draftErr } = await supabaseAdmin
      .from("saved_drafts")
      .select("id,user_id,competition_slug")
      .eq("id", draftId)
      .eq("user_id", userId)
      .maybeSingle();

    if (draftErr) return NextResponse.json({ error: draftErr.message }, { status: 400 });
    if (!draftRow) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

    const draft = draftRow as DraftRow;

    // Find all pool entries linked to this draft.
    const { data: linkedEntries, error: entriesErr } = await supabaseAdmin
      .from("entries")
      .select("id, pool_id, pool:pools(lock_time, competition_slug)")
      .eq("saved_draft_id", draftId)
      .eq("user_id", userId);

    if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 400 });

    const entries = (linkedEntries ?? []) as unknown as EntryWithPool[];

    // Reject if any linked pool is already locked.
    for (const entry of entries) {
      const pool = entry.pool;
      const competitionSlug = (pool?.competition_slug ?? draft.competition_slug) as CompetitionSlug;
      if (isDraftLocked(pool?.lock_time, new Date(), competitionSlug)) {
        return NextResponse.json(
          {
            error: `This draft is entered in a locked pool. Entries are locked as of ${formatDraftLockTimeET(pool?.lock_time, competitionSlug)}.`,
          },
          { status: 423 },
        );
      }
    }

    const entryIds = entries.map((e) => e.id);

    if (entryIds.length > 0) {
      const { error: picksErr } = await supabaseAdmin
        .from("entry_picks")
        .delete()
        .in("entry_id", entryIds);
      if (picksErr) return NextResponse.json({ error: picksErr.message }, { status: 400 });

      const { error: entriesDeleteErr } = await supabaseAdmin
        .from("entries")
        .delete()
        .in("id", entryIds);
      if (entriesDeleteErr) return NextResponse.json({ error: entriesDeleteErr.message }, { status: 400 });

      // Remove pool membership where the user has no remaining entries.
      const affectedPoolIds = [...new Set(entries.map((e) => e.pool_id))];
      for (const poolId of affectedPoolIds) {
        const { data: remaining } = await supabaseAdmin
          .from("entries")
          .select("id")
          .eq("pool_id", poolId)
          .eq("user_id", userId)
          .limit(1);

        if (((remaining ?? []) as EntryIdRow[]).length === 0) {
          const { data: poolOwner } = await supabaseAdmin
            .from("pools")
            .select("created_by")
            .eq("id", poolId)
            .maybeSingle();

          if ((poolOwner as { created_by: string } | null)?.created_by !== userId) {
            await supabaseAdmin
              .from("pool_members")
              .delete()
              .eq("pool_id", poolId)
              .eq("user_id", userId);
          }
        }
      }
    }

    const { error: draftDeleteErr } = await supabaseAdmin
      .from("saved_drafts")
      .delete()
      .eq("id", draftId)
      .eq("user_id", userId);

    if (draftDeleteErr) return NextResponse.json({ error: draftDeleteErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, removedEntryIds: entryIds });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error." },
      { status: 500 },
    );
  }
}
