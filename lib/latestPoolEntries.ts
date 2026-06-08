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

type EntryDetailRow = EntryNameRow & {
  saved_draft_id: string | null;
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

function isMissingEntryNameError(message?: string | null) {
  const text = message ?? "";
  return (
    text.includes("column entries.entry_name does not exist") ||
    text.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
  );
}

function isMissingEntrySavedDraftIdError(message?: string | null) {
  const text = message ?? "";
  return (
    text.includes("column entries.saved_draft_id does not exist") ||
    text.includes("Could not find the 'saved_draft_id' column of 'entries' in the schema cache")
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
  const savedDraftIdByEntry = new Map<string, string | null>();
  const entryPicksByEntry = new Map<string, Set<string>>();

  if (entryIds.length > 0) {
    const [entryNameResult, entryPickResult] = await Promise.all([
      supabase.from("entries").select("id,entry_name,saved_draft_id").in("id", entryIds),
      supabase.from("entry_picks").select("entry_id,team_id").in("entry_id", entryIds),
    ]);

    if (entryPickResult.error) throw entryPickResult.error;

    if (!entryNameResult.error) {
      for (const row of (entryNameResult.data ?? []) as EntryDetailRow[]) {
        entryNameById.set(row.id, row.entry_name ?? null);
        savedDraftIdByEntry.set(row.id, row.saved_draft_id ?? null);
      }
    } else if (isMissingEntrySavedDraftIdError(entryNameResult.error.message)) {
      const fallback = await supabase.from("entries").select("id,entry_name").in("id", entryIds);
      if (fallback.error && !isMissingEntryNameError(fallback.error.message)) {
        throw fallback.error;
      }
      if (!fallback.error) {
        for (const row of (fallback.data ?? []) as EntryNameRow[]) {
          entryNameById.set(row.id, row.entry_name ?? null);
        }
      }
    } else if (!isMissingEntryNameError(entryNameResult.error.message)) {
      throw entryNameResult.error;
    }
    for (const [entryId, picks] of toPickMap((entryPickResult.data ?? []) as EntryPickRow[])) {
      entryPicksByEntry.set(entryId, picks);
    }
  }

  const draftRows = await loadSavedDrafts(supabase, userIds, normalizeCompetitionSlug(competitionSlug));
  const draftById = new Map(draftRows.map((draft) => [draft.id, draft]));
  const linkedDraftIds = Array.from(
    new Set(
      Array.from(savedDraftIdByEntry.values()).filter((draftId): draftId is string => Boolean(draftId)),
    ),
  );
  const missingLinkedDraftIds = linkedDraftIds.filter((draftId) => !draftById.has(draftId));
  if (missingLinkedDraftIds.length > 0) {
    const { data, error } = await supabase
      .from("saved_drafts")
      .select("id,user_id,name,updated_at")
      .in("id", missingLinkedDraftIds);
    if (error) throw error;
    for (const draft of (data ?? []) as SavedDraftRow[]) {
      draftById.set(draft.id, draft);
    }
  }

  const draftRowsWithLinked = Array.from(draftById.values()).sort(sortDraftsByUpdatedAt);
  const draftIds = draftRowsWithLinked.map((row) => row.id);
  let draftPicksByDraft = new Map<string, Set<string>>();

  if (draftIds.length > 0) {
    const { data, error } = await supabase
      .from("saved_draft_picks")
      .select("draft_id,team_id")
      .in("draft_id", draftIds);

    if (error) throw error;
    draftPicksByDraft = toDraftPickMap((data ?? []) as SavedDraftPickRow[]);
  }

  const draftsByUser = new Map<string, SavedDraftRow[]>();
  for (const draft of draftRowsWithLinked) {
    const list = draftsByUser.get(draft.user_id) ?? [];
    list.push(draft);
    draftsByUser.set(draft.user_id, list);
  }

  const entries: LatestPoolEntryRow[] = [];
  const picksByEntry = new Map<string, string[]>();

  for (const row of baseRows) {
    const userDrafts = draftsByUser.get(row.user_id) ?? [];
    const linkedDraftId = savedDraftIdByEntry.get(row.entry_id);
    const linkedDraft = linkedDraftId ? draftById.get(linkedDraftId) ?? null : null;

    const entryPicks = entryPicksByEntry.get(row.entry_id) ?? new Set<string>();
    const entryNameKey = normalizeDraftName(entryNameById.get(row.entry_id));
    const matchedDraft = linkedDraft ??
      userDrafts.find((draft) => normalizeDraftName(draft.name) === entryNameKey) ??
      userDrafts.find((draft) => sameTeamSet(entryPicks, draftPicksByDraft.get(draft.id) ?? new Set<string>())) ??
      null;

    let selectedPicks = entryPicks;
    let entryName = entryNameById.get(row.entry_id) ?? null;
    let latestDraftName: string | null = null;

    if (matchedDraft) {
      const latestDraftPicks = draftPicksByDraft.get(matchedDraft.id) ?? new Set<string>();
      selectedPicks = linkedDraft || latestDraftPicks.size > 0
        ? latestDraftPicks
        : entryPicks;
      latestDraftName = matchedDraft.name.trim() || null;
      entryName = latestDraftName ?? entryNameById.get(row.entry_id) ?? null;
    }

    entries.push({
      entry_id: row.entry_id,
      user_id: row.user_id,
      display_name: row.display_name,
      entry_name: entryName,
      latest_draft_id: matchedDraft?.id ?? null,
      latest_draft_name: latestDraftName,
    });
    picksByEntry.set(row.entry_id, Array.from(selectedPicks));
  }

  return { entries, picksByEntry };
}
