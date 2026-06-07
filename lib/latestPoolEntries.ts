import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCompetitionSlug, type CompetitionSlug } from "./competitions";
import { sameTeamSet } from "./savedDrafts";

export type LatestPoolEntryRow = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
  entry_name: string | null;
  latest_draft_id: string | null;
  latest_draft_name: string | null;
};

type PoolLeaderboardRow = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
};

type EntryNameRow = {
  id: string;
  entry_name: string | null;
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

type LatestPoolEntriesResult = {
  entries: LatestPoolEntryRow[];
  picksByEntry: Map<string, string[]>;
};

function sortDraftsByUpdatedAt(a: SavedDraftRow, b: SavedDraftRow) {
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}

function normalizeDraftName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isMissingSavedDraftCompetitionError(message?: string | null) {
  const text = message ?? "";
  return (
    text.includes("column saved_drafts.competition_slug does not exist") ||
    text.includes("Could not find the 'competition_slug' column of 'saved_drafts' in the schema cache")
  );
}

function toPickMap(rows: EntryPickRow[]) {
  const out = new Map<string, Set<string>>();
  for (const row of rows) {
    const picks = out.get(row.entry_id) ?? new Set<string>();
    picks.add(row.team_id);
    out.set(row.entry_id, picks);
  }
  return out;
}

function toDraftPickMap(rows: SavedDraftPickRow[]) {
  const out = new Map<string, Set<string>>();
  for (const row of rows) {
    const picks = out.get(row.draft_id) ?? new Set<string>();
    picks.add(row.team_id);
    out.set(row.draft_id, picks);
  }
  return out;
}

async function loadSavedDrafts(
  supabase: SupabaseClient,
  userIds: string[],
  competitionSlug: CompetitionSlug,
) {
  if (userIds.length === 0) return [];

  let result = await supabase
    .from("saved_drafts")
    .select("id,user_id,name,updated_at")
    .in("user_id", userIds)
    .eq("competition_slug", competitionSlug)
    .order("updated_at", { ascending: false });

  if (result.error && isMissingSavedDraftCompetitionError(result.error.message)) {
    result = await supabase
      .from("saved_drafts")
      .select("id,user_id,name,updated_at")
      .in("user_id", userIds)
      .order("updated_at", { ascending: false });
  }

  if (result.error) throw result.error;
  return ((result.data ?? []) as SavedDraftRow[]).sort(sortDraftsByUpdatedAt);
}

export async function loadLatestPoolEntries(
  supabase: SupabaseClient,
  poolId: string,
  competitionSlug: CompetitionSlug,
): Promise<LatestPoolEntriesResult> {
  const { data: baseData, error: baseErr } = await supabase
    .from("pool_leaderboard")
    .select("entry_id,user_id,display_name")
    .eq("pool_id", poolId);

  if (baseErr) throw baseErr;

  const baseRows = (baseData ?? []) as PoolLeaderboardRow[];
  const entryIds = baseRows.map((row) => row.entry_id);
  const userIds = Array.from(new Set(baseRows.map((row) => row.user_id)));

  if (baseRows.length === 0) {
    return { entries: [], picksByEntry: new Map() };
  }

  const entryNameById = new Map<string, string | null>();
  const entryPicksByEntry = new Map<string, Set<string>>();

  if (entryIds.length > 0) {
    const [entryNameResult, entryPickResult] = await Promise.all([
      supabase.from("entries").select("id,entry_name").in("id", entryIds),
      supabase.from("entry_picks").select("entry_id,team_id").in("entry_id", entryIds),
    ]);

    if (entryNameResult.error) throw entryNameResult.error;
    if (entryPickResult.error) throw entryPickResult.error;

    for (const row of (entryNameResult.data ?? []) as EntryNameRow[]) {
      entryNameById.set(row.id, row.entry_name ?? null);
    }
    for (const [entryId, picks] of toPickMap((entryPickResult.data ?? []) as EntryPickRow[])) {
      entryPicksByEntry.set(entryId, picks);
    }
  }

  const draftRows = await loadSavedDrafts(supabase, userIds, normalizeCompetitionSlug(competitionSlug));
  const draftIds = draftRows.map((row) => row.id);
  let draftPicksByDraft = new Map<string, Set<string>>();

  if (draftIds.length > 0) {
    const { data, error } = await supabase
      .from("saved_draft_picks")
      .select("draft_id,team_id")
      .in("draft_id", draftIds);

    if (error) throw error;
    draftPicksByDraft = toDraftPickMap((data ?? []) as SavedDraftPickRow[]);
  }

  const rowsByUser = new Map<string, PoolLeaderboardRow[]>();
  for (const row of baseRows) {
    const list = rowsByUser.get(row.user_id) ?? [];
    list.push(row);
    rowsByUser.set(row.user_id, list);
  }

  const draftsByUser = new Map<string, SavedDraftRow[]>();
  for (const draft of draftRows) {
    const list = draftsByUser.get(draft.user_id) ?? [];
    list.push(draft);
    draftsByUser.set(draft.user_id, list);
  }

  const entries: LatestPoolEntryRow[] = [];
  const picksByEntry = new Map<string, string[]>();

  for (const [userId, userRows] of rowsByUser) {
    const userDrafts = draftsByUser.get(userId) ?? [];
    const latestDraft =
      userDrafts.find((draft) => (draftPicksByDraft.get(draft.id)?.size ?? 0) > 0) ??
      userDrafts[0] ??
      null;

    let selectedRow = userRows[0];
    let selectedPicks = entryPicksByEntry.get(selectedRow.entry_id) ?? new Set<string>();
    let entryName = entryNameById.get(selectedRow.entry_id) ?? null;
    let latestDraftName: string | null = null;

    if (latestDraft) {
      const latestDraftPicks = draftPicksByDraft.get(latestDraft.id) ?? new Set<string>();
      const latestDraftNameKey = normalizeDraftName(latestDraft.name);
      const byName = userRows.find(
        (row) => normalizeDraftName(entryNameById.get(row.entry_id)) === latestDraftNameKey,
      );
      const byPicks = userRows.find((row) =>
        sameTeamSet(entryPicksByEntry.get(row.entry_id) ?? new Set<string>(), latestDraftPicks),
      );

      selectedRow = byName ?? byPicks ?? selectedRow;
      selectedPicks = latestDraftPicks.size > 0
        ? latestDraftPicks
        : entryPicksByEntry.get(selectedRow.entry_id) ?? new Set<string>();
      latestDraftName = latestDraft.name.trim() || null;
      entryName = latestDraftName ?? entryNameById.get(selectedRow.entry_id) ?? null;
    }

    entries.push({
      entry_id: selectedRow.entry_id,
      user_id: selectedRow.user_id,
      display_name: selectedRow.display_name,
      entry_name: entryName,
      latest_draft_id: latestDraft?.id ?? null,
      latest_draft_name: latestDraftName,
    });
    picksByEntry.set(selectedRow.entry_id, Array.from(selectedPicks));
  }

  return { entries, picksByEntry };
}
