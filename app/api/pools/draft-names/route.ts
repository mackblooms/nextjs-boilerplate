import { NextResponse } from "next/server";
import { sameTeamSet } from "@/lib/savedDrafts";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PoolEntryRow = {
  entry_id: string;
  user_id: string;
};

type EntryPickRow = {
  entry_id: string;
  team_id: string;
};

type SavedDraftRow = {
  id: string;
  user_id: string;
  name: string;
  updated_at: string;
};

type SavedDraftPickRow = {
  draft_id: string;
  team_id: string;
};

type EntryNameRow = {
  id: string;
  entry_name: string | null;
};

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function isMissingSavedDraftTablesError(error: { message?: string; code?: string } | null | undefined) {
  const message = (error?.message ?? "").toLowerCase();
  return (
    error?.code === "42P01" ||
    message.includes("saved_drafts") ||
    message.includes("saved_draft_picks")
  );
}

function isMissingEntryNameError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return (
    message.includes("column entries.entry_name does not exist") ||
    message.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
  );
}

export async function GET(req: Request) {
  try {
    const poolId = new URL(req.url).searchParams.get("poolId")?.trim() ?? "";
    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData.user) {
      return NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 });
    }

    const requesterId = authData.user.id;

    const { data: memberRow, error: memberErr } = await supabaseAdmin
      .from("pool_members")
      .select("pool_id")
      .eq("pool_id", poolId)
      .eq("user_id", requesterId)
      .maybeSingle();

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 400 });
    }

    if (!memberRow) {
      return NextResponse.json({ error: "Join this pool to view draft names." }, { status: 403 });
    }

    const { data: baseData, error: baseErr } = await supabaseAdmin
      .from("pool_leaderboard")
      .select("entry_id,user_id")
      .eq("pool_id", poolId);

    if (baseErr) {
      return NextResponse.json({ error: baseErr.message }, { status: 400 });
    }

    const baseRows = (baseData ?? []) as PoolEntryRow[];
    if (baseRows.length === 0) {
      return NextResponse.json({ ok: true, draftNamesByEntry: {} });
    }

    const entryIds = baseRows.map((row) => row.entry_id);
    const userIds = Array.from(new Set(baseRows.map((row) => row.user_id)));
    const draftNamesByEntry = new Map<string, string>();

    const entryNameById = new Map<string, string>();
    const entryNameResult = await supabaseAdmin
      .from("entries")
      .select("id,entry_name")
      .in("id", entryIds);
    if (!entryNameResult.error) {
      for (const row of (entryNameResult.data ?? []) as EntryNameRow[]) {
        const trimmed = row.entry_name?.trim();
        if (trimmed) {
          entryNameById.set(row.id, trimmed);
          draftNamesByEntry.set(row.id, trimmed);
        }
      }
    } else if (!isMissingEntryNameError(entryNameResult.error)) {
      return NextResponse.json({ error: entryNameResult.error.message }, { status: 400 });
    }

    const { data: entryPickData, error: entryPickErr } = await supabaseAdmin
      .from("entry_picks")
      .select("entry_id,team_id")
      .in("entry_id", entryIds);

    if (entryPickErr) {
      return NextResponse.json({ error: entryPickErr.message }, { status: 400 });
    }

    const entryPicksByEntry = new Map<string, Set<string>>();
    for (const row of (entryPickData ?? []) as EntryPickRow[]) {
      const picks = entryPicksByEntry.get(row.entry_id) ?? new Set<string>();
      picks.add(row.team_id);
      entryPicksByEntry.set(row.entry_id, picks);
    }

    const { data: draftData, error: draftErr } = await supabaseAdmin
      .from("saved_drafts")
      .select("id,user_id,name,updated_at")
      .in("user_id", userIds);

    if (draftErr) {
      if (isMissingSavedDraftTablesError(draftErr)) {
        return NextResponse.json({ ok: true, draftNamesByEntry: {} });
      }
      return NextResponse.json({ error: draftErr.message }, { status: 400 });
    }

    const draftRows = ((draftData ?? []) as SavedDraftRow[]).sort(
      (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
    );
    if (draftRows.length === 0) {
      return NextResponse.json({ ok: true, draftNamesByEntry: {} });
    }

    const draftIds = draftRows.map((row) => row.id);
    const { data: draftPickData, error: draftPickErr } = await supabaseAdmin
      .from("saved_draft_picks")
      .select("draft_id,team_id")
      .in("draft_id", draftIds);

    if (draftPickErr) {
      if (isMissingSavedDraftTablesError(draftPickErr)) {
        return NextResponse.json({ ok: true, draftNamesByEntry: {} });
      }
      return NextResponse.json({ error: draftPickErr.message }, { status: 400 });
    }

    const draftPicksByDraft = new Map<string, Set<string>>();
    for (const row of (draftPickData ?? []) as SavedDraftPickRow[]) {
      const picks = draftPicksByDraft.get(row.draft_id) ?? new Set<string>();
      picks.add(row.team_id);
      draftPicksByDraft.set(row.draft_id, picks);
    }

    const draftsByUser = new Map<string, SavedDraftRow[]>();
    for (const draft of draftRows) {
      const list = draftsByUser.get(draft.user_id) ?? [];
      list.push(draft);
      draftsByUser.set(draft.user_id, list);
    }

    for (const row of baseRows) {
      if (entryNameById.has(row.entry_id)) {
        continue;
      }

      const userDrafts = draftsByUser.get(row.user_id) ?? [];
      if (userDrafts.length === 0) continue;

      const entryPicks = entryPicksByEntry.get(row.entry_id);
      let resolvedDraftName: string | null = null;

      if (entryPicks && entryPicks.size > 0) {
        for (const draft of userDrafts) {
          const draftPicks = draftPicksByDraft.get(draft.id);
          if (!draftPicks || draftPicks.size === 0) continue;
          if (!sameTeamSet(entryPicks, draftPicks)) continue;
          const trimmed = draft.name.trim();
          if (trimmed) {
            resolvedDraftName = trimmed;
          }
          break;
        }
      }

      if (!resolvedDraftName) {
        const latestNamedDraft = userDrafts.find((draft) => draft.name.trim().length > 0);
        if (latestNamedDraft) {
          resolvedDraftName = latestNamedDraft.name.trim();
        }
      }

      if (resolvedDraftName) {
        draftNamesByEntry.set(row.entry_id, resolvedDraftName);
      }
    }

    return NextResponse.json({
      ok: true,
      draftNamesByEntry: Object.fromEntries(draftNamesByEntry),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
