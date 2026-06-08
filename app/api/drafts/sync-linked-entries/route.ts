import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/adminAuth";
import { normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";
import { isDraftLocked, formatDraftLockTimeET } from "@/lib/draftLock";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type DraftRow = {
  id: string;
  name: string | null;
  user_id: string;
  competition_slug: string | null;
};

type DraftPickRow = {
  team_id: string;
};

type EntryWithPool = {
  id: string;
  pool_id: string;
  pool: { lock_time: string | null; competition_slug: string | null } | null;
};

function isMissingSavedDraftCompetitionError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column saved_drafts.competition_slug does not exist") ||
    message.includes("Could not find the 'competition_slug' column of 'saved_drafts' in the schema cache")
  );
}

function isMissingEntrySavedDraftIdError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.saved_draft_id does not exist") ||
    message.includes("Could not find the 'saved_draft_id' column of 'entries' in the schema cache")
  );
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { draftId?: string };
    const draftId = body.draftId?.trim() ?? "";
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required." }, { status: 400 });
    }

    const userId = authData.user.id;
    const draftResult = await supabaseAdmin
      .from("saved_drafts")
      .select("id,name,user_id,competition_slug")
      .eq("id", draftId)
      .eq("user_id", userId)
      .maybeSingle();

    let draft: DraftRow | null = null;
    let draftError = draftResult.error;
    if (draftResult.error && isMissingSavedDraftCompetitionError(draftResult.error.message)) {
      const fallback = await supabaseAdmin
        .from("saved_drafts")
        .select("id,name,user_id")
        .eq("id", draftId)
        .eq("user_id", userId)
        .maybeSingle();

      draftError = fallback.error;
      draft = fallback.data ? ({ ...fallback.data, competition_slug: null } as DraftRow) : null;
    } else if (!draftResult.error) {
      draft = draftResult.data as DraftRow | null;
    }

    if (draftError) {
      return NextResponse.json({ error: draftError.message }, { status: 400 });
    }
    if (!draft) {
      return NextResponse.json({ error: "Draft not found." }, { status: 404 });
    }

    const competitionSlug = normalizeCompetitionSlug(draft.competition_slug);
    const draftName = draft.name?.trim() || "My Bracket";

    const { data: draftPickRows, error: draftPickErr } = await supabaseAdmin
      .from("saved_draft_picks")
      .select("team_id")
      .eq("draft_id", draftId);

    if (draftPickErr) {
      return NextResponse.json({ error: draftPickErr.message }, { status: 400 });
    }

    const teamIds = Array.from(
      new Set(((draftPickRows ?? []) as DraftPickRow[]).map((row) => row.team_id)),
    );

    const entriesResult = await supabaseAdmin
      .from("entries")
      .select("id,pool_id,pool:pools(lock_time,competition_slug)")
      .eq("saved_draft_id", draftId)
      .eq("user_id", userId);

    if (entriesResult.error) {
      if (isMissingEntrySavedDraftIdError(entriesResult.error.message)) {
        return NextResponse.json({ syncedEntries: 0 });
      }
      return NextResponse.json({ error: entriesResult.error.message }, { status: 400 });
    }

    const entries = ((entriesResult.data ?? []) as unknown as EntryWithPool[]).filter((entry) => entry.id);
    if (entries.length === 0) {
      return NextResponse.json({ syncedEntries: 0 });
    }

    for (const entry of entries) {
      const poolCompetitionSlug = normalizeCompetitionSlug(entry.pool?.competition_slug ?? competitionSlug);
      if (isDraftLocked(entry.pool?.lock_time, new Date(), poolCompetitionSlug as CompetitionSlug)) {
        return NextResponse.json(
          {
            error: `This draft is entered in a locked pool. Entries are locked as of ${formatDraftLockTimeET(entry.pool?.lock_time, poolCompetitionSlug)}.`,
          },
          { status: 423 },
        );
      }
    }

    const entryIds = entries.map((entry) => entry.id);

    const { error: updateNameErr } = await supabaseAdmin
      .from("entries")
      .update({ entry_name: draftName })
      .in("id", entryIds);

    if (updateNameErr) {
      return NextResponse.json({ error: updateNameErr.message }, { status: 400 });
    }

    const { error: deleteErr } = await supabaseAdmin
      .from("entry_picks")
      .delete()
      .in("entry_id", entryIds);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 400 });
    }

    if (teamIds.length > 0) {
      const rows = entryIds.flatMap((entryId) =>
        teamIds.map((teamId) => ({
          entry_id: entryId,
          team_id: teamId,
        })),
      );

      const { error: insertErr } = await supabaseAdmin.from("entry_picks").insert(rows);
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      syncedEntries: entryIds.length,
      syncedPicks: teamIds.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
