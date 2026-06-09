import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isDraftLocked, formatDraftLockTimeET } from "@/lib/draftLock";
import { normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";
import { deleteEntriesAndCleanupMembership, loadDraftLinkedEntries } from "@/lib/draftLinkedEntries";

type DraftRow = {
  id: string;
  user_id: string;
  competition_slug: string | null;
  name: string | null;
};

function isMissingSavedDraftCompetitionError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column saved_drafts.competition_slug does not exist") ||
    message.includes("Could not find the 'competition_slug' column of 'saved_drafts' in the schema cache")
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

    const userId = authData.user.id;
    const body = (await req.json().catch(() => ({}))) as { draftId?: string };
    const draftId = body.draftId?.trim() ?? "";
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required." }, { status: 400 });
    }

    let { data: draftRow, error: draftErr } = await supabaseAdmin
      .from("saved_drafts")
      .select("id,user_id,name,competition_slug")
      .eq("id", draftId)
      .eq("user_id", userId)
      .maybeSingle();

    if (draftErr && isMissingSavedDraftCompetitionError(draftErr.message)) {
      const fallback = await supabaseAdmin
        .from("saved_drafts")
        .select("id,user_id,name")
        .eq("id", draftId)
        .eq("user_id", userId)
        .maybeSingle();
      draftRow = fallback.data ? { ...fallback.data, competition_slug: null } : null;
      draftErr = fallback.error;
    }

    if (draftErr) return NextResponse.json({ error: draftErr.message }, { status: 400 });
    if (!draftRow) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

    const draft = draftRow as DraftRow;

    // Find all pool entries linked to this draft.
    const competitionSlug = normalizeCompetitionSlug(draft.competition_slug);
    const { entries, error: entriesErr } = await loadDraftLinkedEntries(supabaseAdmin, {
      userId,
      draftId,
      draftName: draft.name,
      competitionSlug,
    });

    if (entriesErr) return NextResponse.json({ error: entriesErr.message }, { status: 400 });

    // Reject if any linked pool is already locked.
    for (const entry of entries) {
      const pool = entry.pool;
      const entryCompetitionSlug = (pool?.competition_slug ?? competitionSlug) as CompetitionSlug;
      if (isDraftLocked(pool?.lock_time, new Date(), entryCompetitionSlug)) {
        return NextResponse.json(
          {
            error: `This draft is entered in a locked pool. Entries are locked as of ${formatDraftLockTimeET(pool?.lock_time, entryCompetitionSlug)}.`,
          },
          { status: 423 },
        );
      }
    }

    const deleteResult = await deleteEntriesAndCleanupMembership(supabaseAdmin, userId, entries);
    if (deleteResult.error) return NextResponse.json({ error: deleteResult.error.message }, { status: 400 });

    const { error: draftDeleteErr } = await supabaseAdmin
      .from("saved_drafts")
      .delete()
      .eq("id", draftId)
      .eq("user_id", userId);

    if (draftDeleteErr) return NextResponse.json({ error: draftDeleteErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, removedEntryIds: deleteResult.removedEntryIds });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error." },
      { status: 500 },
    );
  }
}
