import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;
type QueryError = { message: string };

type RawEntryRow = {
  id: string;
  pool_id: string;
  entry_name?: string | null;
  saved_draft_id?: string | null;
  pool?: RawPoolRow | RawPoolRow[] | null;
};

type RawPoolRow = {
  id?: string | null;
  name?: string | null;
  created_by?: string | null;
  lock_time?: string | null;
  competition_slug?: string | null;
};

type EntryPickRow = {
  entry_id: string;
  team_id: string;
};

type DraftPickRow = {
  team_id: string;
};

export type DraftLinkedEntry = {
  id: string;
  pool_id: string;
  entry_name: string | null;
  saved_draft_id: string | null;
  pool: {
    id: string;
    name: string | null;
    created_by: string | null;
    lock_time: string | null;
    competition_slug: CompetitionSlug | null;
  } | null;
};

type EntryQueryVariant = {
  select: string;
  hasEntryName: boolean;
  hasSavedDraftId: boolean;
  hasPoolCompetitionSlug: boolean;
};

const ENTRY_QUERY_VARIANTS: EntryQueryVariant[] = [
  {
    select: "id,pool_id,entry_name,saved_draft_id,pool:pools(id,name,created_by,lock_time,competition_slug)",
    hasEntryName: true,
    hasSavedDraftId: true,
    hasPoolCompetitionSlug: true,
  },
  {
    select: "id,pool_id,entry_name,saved_draft_id,pool:pools(id,name,created_by,lock_time)",
    hasEntryName: true,
    hasSavedDraftId: true,
    hasPoolCompetitionSlug: false,
  },
  {
    select: "id,pool_id,entry_name,pool:pools(id,name,created_by,lock_time,competition_slug)",
    hasEntryName: true,
    hasSavedDraftId: false,
    hasPoolCompetitionSlug: true,
  },
  {
    select: "id,pool_id,entry_name,pool:pools(id,name,created_by,lock_time)",
    hasEntryName: true,
    hasSavedDraftId: false,
    hasPoolCompetitionSlug: false,
  },
  {
    select: "id,pool_id,saved_draft_id,pool:pools(id,name,created_by,lock_time,competition_slug)",
    hasEntryName: false,
    hasSavedDraftId: true,
    hasPoolCompetitionSlug: true,
  },
  {
    select: "id,pool_id,saved_draft_id,pool:pools(id,name,created_by,lock_time)",
    hasEntryName: false,
    hasSavedDraftId: true,
    hasPoolCompetitionSlug: false,
  },
  {
    select: "id,pool_id,pool:pools(id,name,created_by,lock_time,competition_slug)",
    hasEntryName: false,
    hasSavedDraftId: false,
    hasPoolCompetitionSlug: true,
  },
  {
    select: "id,pool_id,pool:pools(id,name,created_by,lock_time)",
    hasEntryName: false,
    hasSavedDraftId: false,
    hasPoolCompetitionSlug: false,
  },
];

export function isMissingEntrySavedDraftIdError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.saved_draft_id does not exist") ||
    message.includes("Could not find the 'saved_draft_id' column of 'entries' in the schema cache")
  );
}

export function normalizeDraftEntryName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function sameTeamSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function normalizePool(pool: RawPoolRow | RawPoolRow[] | null | undefined, poolId: string, hasCompetitionSlug: boolean) {
  const rawPool = Array.isArray(pool) ? pool[0] : pool;
  if (!rawPool) return null;

  return {
    id: rawPool.id ?? poolId,
    name: rawPool.name ?? null,
    created_by: rawPool.created_by ?? null,
    lock_time: rawPool.lock_time ?? null,
    competition_slug: hasCompetitionSlug ? normalizeCompetitionSlug(rawPool.competition_slug) : null,
  };
}

async function loadDraftPickSet(supabaseAdmin: SupabaseAdmin, draftId: string) {
  const { data, error } = await supabaseAdmin
    .from("saved_draft_picks")
    .select("team_id")
    .eq("draft_id", draftId);

  if (error) return { picks: new Set<string>(), error };
  return {
    picks: new Set(((data ?? []) as DraftPickRow[]).map((row) => row.team_id)),
    error: null,
  };
}

async function loadUserEntries(supabaseAdmin: SupabaseAdmin, userId: string) {
  let lastError: QueryError | null = null;

  for (const variant of ENTRY_QUERY_VARIANTS) {
    const { data, error } = await supabaseAdmin
      .from("entries")
      .select(variant.select)
      .eq("user_id", userId);

    if (error) {
      lastError = error;
      continue;
    }

    const entries = ((data ?? []) as unknown as RawEntryRow[]).map((row) => ({
      id: row.id,
      pool_id: row.pool_id,
      entry_name: variant.hasEntryName ? row.entry_name ?? null : null,
      saved_draft_id: variant.hasSavedDraftId ? row.saved_draft_id ?? null : null,
      pool: normalizePool(row.pool, row.pool_id, variant.hasPoolCompetitionSlug),
    }));

    return { entries, error: null };
  }

  return { entries: [] as DraftLinkedEntry[], error: lastError };
}

async function loadEntryPickMap(supabaseAdmin: SupabaseAdmin, entryIds: string[]) {
  const pickMap = new Map<string, Set<string>>();
  for (const entryId of entryIds) pickMap.set(entryId, new Set());
  if (entryIds.length === 0) return { pickMap, error: null };

  const { data, error } = await supabaseAdmin
    .from("entry_picks")
    .select("entry_id,team_id")
    .in("entry_id", entryIds);

  if (error) return { pickMap, error };

  for (const row of (data ?? []) as EntryPickRow[]) {
    const picks = pickMap.get(row.entry_id) ?? new Set<string>();
    picks.add(row.team_id);
    pickMap.set(row.entry_id, picks);
  }

  return { pickMap, error: null };
}

export async function loadDraftLinkedEntries(
  supabaseAdmin: SupabaseAdmin,
  options: {
    userId: string;
    draftId: string;
    draftName: string | null | undefined;
    competitionSlug: CompetitionSlug;
  },
) {
  const draftPickResult = await loadDraftPickSet(supabaseAdmin, options.draftId);
  if (draftPickResult.error) return { entries: [] as DraftLinkedEntry[], error: draftPickResult.error };

  const userEntryResult = await loadUserEntries(supabaseAdmin, options.userId);
  if (userEntryResult.error) return { entries: [] as DraftLinkedEntry[], error: userEntryResult.error };

  const entryPickResult = await loadEntryPickMap(
    supabaseAdmin,
    userEntryResult.entries.map((entry) => entry.id),
  );
  if (entryPickResult.error) return { entries: [] as DraftLinkedEntry[], error: entryPickResult.error };

  const draftNameKey = normalizeDraftEntryName(options.draftName);
  const matches = userEntryResult.entries.filter((entry) => {
    const poolCompetitionSlug = entry.pool?.competition_slug;
    if (poolCompetitionSlug && poolCompetitionSlug !== options.competitionSlug) return false;

    if (entry.saved_draft_id === options.draftId) return true;
    if (draftNameKey && normalizeDraftEntryName(entry.entry_name) === draftNameKey) return true;

    const entryPicks = entryPickResult.pickMap.get(entry.id) ?? new Set<string>();
    return draftPickResult.picks.size > 0 && entryPicks.size > 0 && sameTeamSet(draftPickResult.picks, entryPicks);
  });

  return { entries: matches, error: null };
}

export async function deleteEntriesAndCleanupMembership(
  supabaseAdmin: SupabaseAdmin,
  userId: string,
  entries: DraftLinkedEntry[],
) {
  const entryIds = Array.from(new Set(entries.map((entry) => entry.id)));
  if (entryIds.length === 0) {
    return { error: null, removedEntryIds: [] as string[], membershipRemovedPoolIds: [] as string[] };
  }

  const { error: picksDeleteErr } = await supabaseAdmin
    .from("entry_picks")
    .delete()
    .in("entry_id", entryIds);
  if (picksDeleteErr) return { error: picksDeleteErr, removedEntryIds: [] as string[], membershipRemovedPoolIds: [] as string[] };

  const { error: entriesDeleteErr } = await supabaseAdmin
    .from("entries")
    .delete()
    .in("id", entryIds);
  if (entriesDeleteErr) return { error: entriesDeleteErr, removedEntryIds: [] as string[], membershipRemovedPoolIds: [] as string[] };

  const membershipRemovedPoolIds: string[] = [];
  const affectedPoolIds = Array.from(new Set(entries.map((entry) => entry.pool_id)));
  for (const poolId of affectedPoolIds) {
    const { data: remaining, error: remainingErr } = await supabaseAdmin
      .from("entries")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", userId)
      .limit(1);

    if (remainingErr) return { error: remainingErr, removedEntryIds: entryIds, membershipRemovedPoolIds };
    if ((remaining ?? []).length > 0) continue;

    const entryForPool = entries.find((entry) => entry.pool_id === poolId);
    let poolOwnerId = entryForPool?.pool?.created_by ?? null;
    if (!poolOwnerId) {
      const { data: poolOwner } = await supabaseAdmin
        .from("pools")
        .select("created_by")
        .eq("id", poolId)
        .maybeSingle();
      poolOwnerId = (poolOwner as { created_by?: string } | null)?.created_by ?? null;
    }

    if (poolOwnerId === userId) continue;

    const { error: membershipDeleteErr } = await supabaseAdmin
      .from("pool_members")
      .delete()
      .eq("pool_id", poolId)
      .eq("user_id", userId);

    if (membershipDeleteErr) return { error: membershipDeleteErr, removedEntryIds: entryIds, membershipRemovedPoolIds };
    membershipRemovedPoolIds.push(poolId);
  }

  return { error: null, removedEntryIds: entryIds, membershipRemovedPoolIds };
}
