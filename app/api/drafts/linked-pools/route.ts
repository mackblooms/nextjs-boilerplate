import { NextResponse } from "next/server";
import { getBearerToken } from "@/lib/adminAuth";
import { normalizeCompetitionSlug } from "@/lib/competitions";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { loadDraftLinkedEntries } from "@/lib/draftLinkedEntries";

type DraftRow = {
  id: string;
  name: string | null;
  user_id: string;
  competition_slug: string | null;
};

function isMissingSavedDraftCompetitionError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column saved_drafts.competition_slug does not exist") ||
    message.includes("Could not find the 'competition_slug' column of 'saved_drafts' in the schema cache")
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

    let draft = draftResult.data as DraftRow | null;
    let draftError = draftResult.error;
    if (draftResult.error && isMissingSavedDraftCompetitionError(draftResult.error.message)) {
      const fallback = await supabaseAdmin
        .from("saved_drafts")
        .select("id,name,user_id")
        .eq("id", draftId)
        .eq("user_id", userId)
        .maybeSingle();
      draft = fallback.data ? ({ ...fallback.data, competition_slug: null } as DraftRow) : null;
      draftError = fallback.error;
    }

    if (draftError) return NextResponse.json({ error: draftError.message }, { status: 400 });
    if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });

    const competitionSlug = normalizeCompetitionSlug(draft.competition_slug);
    const { entries, error } = await loadDraftLinkedEntries(supabaseAdmin, {
      userId,
      draftId,
      draftName: draft.name,
      competitionSlug,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const grouped = new Map<
      string,
      {
        poolId: string;
        poolName: string | null;
        lockTime: string | null;
        competitionSlug: string;
        entryIds: string[];
      }
    >();

    for (const entry of entries) {
      const current = grouped.get(entry.pool_id) ?? {
        poolId: entry.pool_id,
        poolName: entry.pool?.name ?? null,
        lockTime: entry.pool?.lock_time ?? null,
        competitionSlug: entry.pool?.competition_slug ?? competitionSlug,
        entryIds: [],
      };
      current.entryIds.push(entry.id);
      grouped.set(entry.pool_id, current);
    }

    return NextResponse.json({
      entries: Array.from(grouped.values()).sort((a, b) =>
        (a.poolName ?? "").localeCompare(b.poolName ?? ""),
      ),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
