"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { formatDraftLockTimeET, isDraftLocked, resolveDraftLockTime } from "@/lib/draftLock";
import { trackEvent } from "@/lib/analytics";
import {
  sortDraftTeamsForCompetition,
  summarizeDraft,
  type DraftableTeam,
} from "@/lib/draftRules";
import {
  isMissingSavedDraftTablesError,
  sameTeamSet,
  type SavedDraftPickRow,
  type SavedDraftRow,
} from "@/lib/savedDrafts";
import { toSchoolDisplayName } from "@/lib/teamNames";
import { competitionPath, normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";
import { canUseLegacyMarchMadnessFallback } from "@/lib/competitionData";
import { getWorldCupTierForCost, withWorldCupDraftCost } from "@/lib/worldCupRules";
import { worldCupLogoUrl } from "@/lib/worldCupLogos";

type PoolRow = {
  id: string;
  name: string;
  is_private: boolean | null;
  lock_time: string | null;
  competition_slug?: string;
};

type TeamRow = DraftableTeam & {
  logo_url?: string | null;
};

type DraftRow = Pick<SavedDraftRow, "id" | "name" | "created_at" | "updated_at">;

type GameRow = {
  round: string;
  team1_id: string | null;
  team2_id: string | null;
};

type EntryRow = {
  id: string;
  entry_name: string | null;
  saved_draft_id?: string | null;
};

function isTeamRow(value: TeamRow | undefined): value is TeamRow {
  return Boolean(value);
}

function isMissingEntryNameError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.entry_name does not exist") ||
    message.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
  );
}

function isMissingSavedDraftIdError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.saved_draft_id does not exist") ||
    message.includes("Could not find the 'saved_draft_id' column of 'entries' in the schema cache")
  );
}

function isSingleEntryPerPoolConstraintError(message?: string) {
  if (!message) return false;
  const lowered = message.toLowerCase();
  return (
    lowered.includes("entries_pool_id_user_id_key") ||
    (lowered.includes("duplicate key") &&
      lowered.includes("pool_id") &&
      lowered.includes("user_id"))
  );
}

function normalizeDraftName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function toPickMap(draftIds: string[], rows: SavedDraftPickRow[]) {
  const out = new Map<string, Set<string>>();
  for (const id of draftIds) out.set(id, new Set());
  for (const row of rows) out.get(row.draft_id)?.add(row.team_id);
  return out;
}

function toSortedDraftRows(rows: SavedDraftRow[]) {
  return [...rows]
    .map((row) => ({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export default function PoolDraftPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;
  const [initialDraftId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("draftId")?.trim() ?? "";
  });

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [pool, setPool] = useState<PoolRow | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [existingEntries, setExistingEntries] = useState<EntryRow[]>([]);
  const [entryPickMap, setEntryPickMap] = useState<Map<string, Set<string>>>(new Map());

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [pickMap, setPickMap] = useState<Map<string, Set<string>>>(new Map());
  const [selectedDraftId, setSelectedDraftId] = useState("");

  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);
  const [applying, setApplying] = useState(false);

  const [locked, setLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);
  const [competitionSlug, setCompetitionSlug] = useState<CompetitionSlug>("march-madness");

  const poolIsPrivate = (pool?.is_private ?? true) !== false;

  const teamById = useMemo(() => {
    const map = new Map<string, TeamRow>();
    for (const row of teams) map.set(row.id, row);
    return map;
  }, [teams]);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId]
  );
  const selectedDraftPicks = useMemo(
    () => pickMap.get(selectedDraftId) ?? new Set<string>(),
    [pickMap, selectedDraftId]
  );
  const selectedDraftTeams = useMemo(
    () =>
      Array.from(selectedDraftPicks)
        .map((teamId) => teamById.get(teamId))
        .filter(isTeamRow)
        .sort(sortDraftTeamsForCompetition(competitionSlug)) as TeamRow[],
    [competitionSlug, selectedDraftPicks, teamById]
  );

  const selectedDraftSummary = useMemo(
    () => summarizeDraft(selectedDraftPicks, teamById, competitionSlug),
    [competitionSlug, selectedDraftPicks, teamById]
  );

  const enteredEntryIdByDraftId = useMemo(() => {
    const out = new Map<string, string>();
    const draftIdsByName = new Map<string, string[]>();

    for (const draft of drafts) {
      const key = normalizeDraftName(draft.name);
      if (!key) continue;
      const ids = draftIdsByName.get(key) ?? [];
      ids.push(draft.id);
      draftIdsByName.set(key, ids);
    }

    for (const entry of existingEntries) {
      if (entry.saved_draft_id) {
        out.set(entry.saved_draft_id, entry.id);
        continue;
      }
      const matchingDraftIds = draftIdsByName.get(normalizeDraftName(entry.entry_name));
      if (!matchingDraftIds) continue;
      for (const draftId of matchingDraftIds) {
        if (!out.has(draftId)) out.set(draftId, entry.id);
      }
    }

    for (const draft of drafts) {
      if (out.has(draft.id)) continue;
      const draftPickSet = pickMap.get(draft.id) ?? new Set<string>();
      if (draftPickSet.size === 0) continue;

      for (const [entryId, entryPicks] of entryPickMap.entries()) {
        if (entryPicks.size === 0) continue;
        if (!sameTeamSet(draftPickSet, entryPicks)) continue;
        out.set(draft.id, entryId);
        break;
      }
    }

    return out;
  }, [drafts, entryPickMap, existingEntries, pickMap]);

  const selectedDraftEnteredEntryId = selectedDraftId
    ? enteredEntryIdByDraftId.get(selectedDraftId) ?? null
    : null;

  const selectedDraftAlreadyEnteredInPool = Boolean(selectedDraftEnteredEntryId);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLoading(false);
      setIsMember(false);
      setMessage("Please log in first.");
      return;
    }

    let { data: poolRow, error: poolErr } = await supabase
      .from("pools")
      .select("id,name,is_private,lock_time,competition_slug")
      .eq("id", poolId)
      .single();

    if (canUseLegacyMarchMadnessFallback("march-madness", poolErr?.message)) {
      const fallback = await supabase
        .from("pools")
        .select("id,name,is_private,lock_time")
        .eq("id", poolId)
        .single();
      poolRow = fallback.data ? { ...fallback.data, competition_slug: null } : null;
      poolErr = fallback.error;
    }

    if (poolErr) {
      setLoading(false);
      setMessage(poolErr.message);
      return;
    }

    const typedPool = poolRow as PoolRow;
    const nextCompetitionSlug = normalizeCompetitionSlug(typedPool.competition_slug);
    setCompetitionSlug(nextCompetitionSlug);
    setPool(typedPool);
    setLockTime(resolveDraftLockTime(typedPool.lock_time ?? null, nextCompetitionSlug));
    setLocked(isDraftLocked(typedPool.lock_time ?? null, new Date(), nextCompetitionSlug));

    const { data: memRow, error: memErr } = await supabase
      .from("pool_members")
      .select("pool_id")
      .eq("pool_id", poolId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memErr) {
      setLoading(false);
      setMessage(memErr.message);
      return;
    }

    setIsMember(Boolean(memRow));

    let { data: gameRows, error: gameErr } = await supabase
      .from("games")
      .select("round,team1_id,team2_id")
      .eq("competition_slug", nextCompetitionSlug);

    if (canUseLegacyMarchMadnessFallback(nextCompetitionSlug, gameErr?.message)) {
      const fallback = await supabase.from("games").select("round,team1_id,team2_id");
      gameRows = fallback.data;
      gameErr = fallback.error;
    }

    if (gameErr) {
      setLoading(false);
      setMessage(gameErr.message);
      return;
    }

    const r64TeamIds = Array.from(
      new Set(
        ((gameRows ?? []) as GameRow[])
          .filter((g) => nextCompetitionSlug === "world-cup" || g.round === "R64")
          .flatMap((g) => [g.team1_id, g.team2_id])
          .filter((id): id is string => Boolean(id))
      )
    );

    let teamQuery = supabase
      .from("teams")
      .select("id,name,seed,cost,logo_url")
      .eq("competition_slug", nextCompetitionSlug);
    if (r64TeamIds.length > 0) {
      teamQuery = teamQuery.in("id", r64TeamIds);
    }

    let { data: teamRows, error: teamErr } = await teamQuery;
    if (canUseLegacyMarchMadnessFallback(nextCompetitionSlug, teamErr?.message)) {
      const fallback = r64TeamIds.length > 0
        ? await supabase.from("teams").select("id,name,seed,cost,logo_url").in("id", r64TeamIds)
        : await supabase.from("teams").select("id,name,seed,cost,logo_url");
      teamRows = fallback.data;
      teamErr = fallback.error;
    }
    if (teamErr) {
      setLoading(false);
      setMessage(teamErr.message);
      return;
    }
    const normalizedTeamRows = ((teamRows ?? []) as TeamRow[]).map((team) =>
      nextCompetitionSlug === "world-cup" ? withWorldCupDraftCost(team) : team,
    );
    setTeams(normalizedTeamRows.sort(sortDraftTeamsForCompetition(nextCompetitionSlug)));

    if (!memRow) {
      setExistingEntries([]);
      setEntryPickMap(new Map());
      setLoading(false);
      return;
    }

    const entriesWithNames = await supabase
      .from("entries")
      .select("id,entry_name,saved_draft_id")
      .eq("pool_id", poolId)
      .eq("user_id", user.id);

    let nextEntries: EntryRow[] = [];
    if (entriesWithNames.error && isMissingSavedDraftIdError(entriesWithNames.error.message)) {
      const entriesWithoutSavedDraftId = await supabase
        .from("entries")
        .select("id,entry_name")
        .eq("pool_id", poolId)
        .eq("user_id", user.id);

      if (entriesWithoutSavedDraftId.error && !isMissingEntryNameError(entriesWithoutSavedDraftId.error.message)) {
        setLoading(false);
        setMessage(entriesWithoutSavedDraftId.error.message);
        return;
      }

      if (entriesWithoutSavedDraftId.error && isMissingEntryNameError(entriesWithoutSavedDraftId.error.message)) {
        const fallbackEntries = await supabase
          .from("entries")
          .select("id")
          .eq("pool_id", poolId)
          .eq("user_id", user.id);

        if (fallbackEntries.error) {
          setLoading(false);
          setMessage(fallbackEntries.error.message);
          return;
        }

        nextEntries = ((fallbackEntries.data ?? []) as Array<{ id: string }>).map((entry) => ({
          id: entry.id,
          entry_name: null,
          saved_draft_id: null,
        }));
      } else {
        nextEntries = ((entriesWithoutSavedDraftId.data ?? []) as Array<{ id: string; entry_name: string | null }>).map(
          (entry) => ({
            id: entry.id,
            entry_name: entry.entry_name,
            saved_draft_id: null,
          }),
        );
      }
    } else if (
      entriesWithNames.error &&
      !isMissingEntryNameError(entriesWithNames.error.message)
    ) {
      setLoading(false);
      setMessage(entriesWithNames.error.message);
      return;
    } else if (entriesWithNames.error && isMissingEntryNameError(entriesWithNames.error.message)) {
      const fallbackEntries = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id);

      if (fallbackEntries.error) {
        setLoading(false);
        setMessage(fallbackEntries.error.message);
        return;
      }

      nextEntries = ((fallbackEntries.data ?? []) as Array<{ id: string }>).map((entry) => ({
        id: entry.id,
        entry_name: null,
        saved_draft_id: null,
      }));
    } else {
      nextEntries = (entriesWithNames.data ?? []) as EntryRow[];
    }

    setExistingEntries(nextEntries);
    const nextEntryPickMap = new Map<string, Set<string>>();
    const entryIds = nextEntries.map((entry) => entry.id);
    if (entryIds.length > 0) {
      const entryPicksQuery = await supabase
        .from("entry_picks")
        .select("entry_id,team_id")
        .in("entry_id", entryIds);

      if (entryPicksQuery.error) {
        setLoading(false);
        setMessage(entryPicksQuery.error.message);
        return;
      }

      for (const entryId of entryIds) nextEntryPickMap.set(entryId, new Set());
      for (const row of (entryPicksQuery.data ?? []) as Array<{ entry_id: string; team_id: string }>) {
        const picks = nextEntryPickMap.get(row.entry_id) ?? new Set<string>();
        picks.add(row.team_id);
        nextEntryPickMap.set(row.entry_id, picks);
      }
    }
    setEntryPickMap(nextEntryPickMap);

    let draftRowsQuery = await supabase
      .from("saved_drafts")
      .select("id,user_id,name,created_at,updated_at")
      .eq("user_id", user.id)
      .eq("competition_slug", nextCompetitionSlug)
      .order("updated_at", { ascending: false });

    if (canUseLegacyMarchMadnessFallback(nextCompetitionSlug, draftRowsQuery.error?.message)) {
      draftRowsQuery = await supabase
        .from("saved_drafts")
        .select("id,user_id,name,created_at,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
    }

    if (draftRowsQuery.error) {
      setLoading(false);
      if (isMissingSavedDraftTablesError(draftRowsQuery.error.message)) {
        setMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
        return;
      }
      setMessage(draftRowsQuery.error.message);
      return;
    }

    const nextDraftRows = toSortedDraftRows((draftRowsQuery.data ?? []) as SavedDraftRow[]);
    if (nextDraftRows.length === 0) {
      setDrafts([]);
      setPickMap(new Map());
      setSelectedDraftId("");
      setLoading(false);
      return;
    }

    const draftIds = nextDraftRows.map((draft) => draft.id);
    const picksQuery = await supabase
      .from("saved_draft_picks")
      .select("draft_id,team_id")
      .in("draft_id", draftIds);

    if (picksQuery.error) {
      setLoading(false);
      setMessage(picksQuery.error.message);
      return;
    }

    const nextPickMap = toPickMap(draftIds, (picksQuery.data ?? []) as SavedDraftPickRow[]);

    setDrafts(nextDraftRows);
    setPickMap(nextPickMap);
    setSelectedDraftId(
      initialDraftId && nextDraftRows.some((draft) => draft.id === initialDraftId)
        ? initialDraftId
        : nextDraftRows[0]?.id ?? "",
    );

    setLoading(false);
  }, [initialDraftId, poolId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function tryLinkSavedDraft(entryId: string, savedDraftId: string) {
    const linkDraftResult = await supabase
      .from("entries")
      .update({ saved_draft_id: savedDraftId })
      .eq("id", entryId);

    if (linkDraftResult.error && !isMissingSavedDraftIdError(linkDraftResult.error.message)) {
      return linkDraftResult.error.message;
    }

    return null;
  }

  async function createPoolEntry(poolIdValue: string, userId: string, entryName: string, savedDraftId?: string): Promise<EntryRow> {
    const trimmedName = entryName.trim();
    const insertWithName = await supabase
      .from("entries")
      .insert({
        pool_id: poolIdValue,
        user_id: userId,
        entry_name: trimmedName || "My Bracket",
      })
      .select("id,entry_name")
      .single();

    if (!insertWithName.error && insertWithName.data) {
      const row = insertWithName.data as { id: string; entry_name: string | null };
      if (savedDraftId) {
        const linkError = await tryLinkSavedDraft(row.id, savedDraftId);
        if (linkError) throw new Error(linkError);
      }
      return { id: row.id, entry_name: row.entry_name, saved_draft_id: savedDraftId ?? null };
    }

    if (!isMissingEntryNameError(insertWithName.error?.message)) {
      if (isSingleEntryPerPoolConstraintError(insertWithName.error?.message)) {
        throw new Error(
          "Your database still allows only one entry per pool. Run db/migrations/20260318_entries_allow_multiple_per_pool.sql, then try again."
        );
      }
      throw new Error(insertWithName.error?.message ?? "Failed to create entry.");
    }

    const insertFallback = await supabase
      .from("entries")
      .insert({
        pool_id: poolIdValue,
        user_id: userId,
      })
      .select("id")
      .single();

    if (insertFallback.error || !insertFallback.data) {
      if (isSingleEntryPerPoolConstraintError(insertFallback.error?.message)) {
        throw new Error(
          "Your database still allows only one entry per pool. Run db/migrations/20260318_entries_allow_multiple_per_pool.sql, then try again."
        );
      }
      throw new Error(insertFallback.error?.message ?? "Failed to create entry.");
    }

    if (savedDraftId) {
      const linkError = await tryLinkSavedDraft(insertFallback.data.id as string, savedDraftId);
      if (linkError) throw new Error(linkError);
    }

    return { id: insertFallback.data.id as string, entry_name: null, saved_draft_id: savedDraftId ?? null };
  }

  async function joinPool() {
    setMessage("");
    setJoining(true);

    trackEvent({
      eventName: "pool_join_attempt",
      poolId,
      metadata: { location: "pool_draft_apply_page", is_private: poolIsPrivate },
    });

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setJoining(false);
      setMessage("Please log in first.");
      return;
    }

    if (poolIsPrivate && !joinPassword.trim()) {
      setJoining(false);
      setMessage("Enter this pool's password.");
      return;
    }

    const res = await fetch("/api/pools/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        poolId,
        password: joinPassword,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setJoining(false);
      setMessage(body.error ?? "Failed to join pool.");
      trackEvent({
        eventName: "pool_join_failure",
        poolId,
        metadata: { location: "pool_draft_apply_page", reason: body.error ?? "api_error" },
      });
      return;
    }

    setJoinPassword("");
    trackEvent({
      eventName: "pool_join_success",
      poolId,
      metadata: { location: "pool_draft_apply_page", is_private: poolIsPrivate },
    });
    setJoining(false);
    await load();
    setMessage("Joined pool. Pick a saved draft and enter it.");
  }

  async function applyDraftToPool() {
    if (!isMember) {
      setMessage("Join this pool before entering a draft.");
      return;
    }

    if (!selectedDraft) {
      setMessage("Select a draft first.");
      return;
    }

    if (locked) {
      setMessage("Draft is locked for this pool.");
      return;
    }

    if (!selectedDraftSummary.isValid) {
      setMessage(selectedDraftSummary.error ?? "Selected draft is invalid.");
      return;
    }

    if (selectedDraftAlreadyEnteredInPool) {
      setMessage(`"${selectedDraft.name}" is already entered in this pool. Choose a different saved draft.`);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setMessage("Please log in first.");
      return;
    }

    setApplying(true);
    setMessage("");

    let createdEntry: EntryRow;

    try {
      createdEntry = await createPoolEntry(poolId, user.id, selectedDraft.name, selectedDraft.id);
    } catch (error: unknown) {
      setApplying(false);
      setMessage(error instanceof Error ? error.message : "Failed to create pool entry.");
      return;
    }

    trackEvent({
      eventName: "pool_draft_apply_attempt",
      poolId,
      entryId: createdEntry.id,
      metadata: {
        mode: "create_new_entry",
        draft_id: selectedDraft.id,
        selected_count: selectedDraftPicks.size,
        total_cost: selectedDraftSummary.totalCost,
      },
    });

    const rows = Array.from(selectedDraftPicks).map((teamId) => ({
      entry_id: createdEntry.id,
      team_id: teamId,
    }));

    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from("entry_picks").insert(rows);
      if (insertErr) {
        setApplying(false);
        setMessage(insertErr.message);
        trackEvent({
          eventName: "pool_draft_apply_failure",
          poolId,
          entryId: createdEntry.id,
          metadata: { draft_id: selectedDraft.id, reason: insertErr.message },
        });
        return;
      }
    }

    setExistingEntries((prev) => [...prev, createdEntry]);
    setEntryPickMap((prev) => {
      const next = new Map(prev);
      next.set(createdEntry.id, new Set(selectedDraftPicks));
      return next;
    });

    setApplying(false);
    setMessage(`Entered "${selectedDraft.name}" in ${pool?.name ?? "this pool"}.`);
    trackEvent({
      eventName: "pool_draft_apply_success",
      poolId,
      entryId: createdEntry.id,
      metadata: {
        mode: "create_new_entry",
        draft_id: selectedDraft.id,
        selected_count: selectedDraftPicks.size,
        total_cost: selectedDraftSummary.totalCost,
      },
    });
  }

  if (loading) {
    return (
      <main className="page-shell page-shell--stack" style={{ maxWidth: 980 }}>
        <h1 className="page-title" style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
          Pool Draft
        </h1>
        <p style={{ marginTop: 12 }}>Loading...</p>
      </main>
    );
  }

  return (
    <main className="page-shell page-shell--stack" style={{ maxWidth: 1000 }}>
      <section
        className="page-surface"
        style={{
          padding: 14,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.24, opacity: 0.62 }}>
              Pool draft
            </div>
            <h1 className="page-title" style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
              {pool?.name ?? "Pool"}
            </h1>
            <p style={{ margin: 0, opacity: 0.85 }}>
              Enter saved drafts into this pool or replace an existing entry when you want to change picks.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={competitionPath("/drafts", competitionSlug)} className="ui-btn ui-btn--md ui-btn--secondary">
              Edit Drafts
            </Link>
            <Link href={`/pool/${poolId}/leaderboard`} className="ui-btn ui-btn--md ui-btn--primary">
              Leaderboard
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 12,
              borderRadius: 999,
              padding: "6px 10px",
              border: "1px solid var(--border-color)",
              background: "var(--surface-muted)",
              fontWeight: 800,
            }}
          >
            {poolIsPrivate ? "Private pool" : "Public pool"}
          </span>
          {isMember ? (
            <span
              style={{
                fontSize: 12,
                borderRadius: 999,
                padding: "6px 10px",
                border: "1px solid var(--border-color)",
                background: "var(--success-bg)",
                fontWeight: 800,
              }}
            >
              You are a member
            </span>
          ) : null}
          {locked ? (
            <span
              style={{
                fontSize: 12,
                borderRadius: 999,
                padding: "6px 10px",
                border: "1px solid var(--warning-border)",
                background: "var(--warning-bg)",
                fontWeight: 800,
              }}
            >
              Draft locked
            </span>
          ) : null}
        </div>

        {lockTime ? (
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>Lock time: {formatDraftLockTimeET(lockTime, competitionSlug)}</p>
        ) : null}
      </section>

      {!isMember ? (
        <section
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Join this pool</h2>
          <p style={{ margin: 0, opacity: 0.85 }}>
            {poolIsPrivate
              ? "Enter the pool password to join, then you can enter any saved draft."
              : "Join this pool to enter one or more saved drafts."}
          </p>
          {poolIsPrivate ? (
            <input
              type="password"
              value={joinPassword}
              onChange={(event) => setJoinPassword(event.target.value)}
              placeholder="Pool password"
              className="ui-control ui-control--full"
              style={{ maxWidth: 380 }}
            />
          ) : null}
          <button
            type="button"
            onClick={() => void joinPool()}
            disabled={joining}
            className="ui-btn ui-btn--lg ui-btn--primary"
            style={{ width: "100%", maxWidth: 240 }}
          >
            {joining ? "Joining..." : "Join pool"}
          </button>
        </section>
      ) : null}

      {isMember ? (
        <section
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <label htmlFor="pool-draft-select" style={{ fontWeight: 800, fontSize: 13 }}>
              Saved draft
            </label>
            <select
              id="pool-draft-select"
              value={selectedDraftId}
              onChange={(event) => setSelectedDraftId(event.target.value)}
              className="ui-control ui-control--full ui-select"
              style={{ maxWidth: 420 }}
            >
              {drafts.length === 0 ? <option value="">No drafts available</option> : null}
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void applyDraftToPool()}
              disabled={
                applying ||
                !selectedDraft ||
                locked ||
                !selectedDraftSummary.isValid ||
                drafts.length === 0 ||
                selectedDraftAlreadyEnteredInPool
              }
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                fontWeight: 900,
                cursor:
                  applying ||
                  !selectedDraft ||
                  locked ||
                  !selectedDraftSummary.isValid ||
                  drafts.length === 0 ||
                  selectedDraftAlreadyEnteredInPool
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  applying ||
                  !selectedDraft ||
                  locked ||
                  !selectedDraftSummary.isValid ||
                  drafts.length === 0 ||
                  selectedDraftAlreadyEnteredInPool
                    ? 0.7
                    : 1,
              }}
            >
              {applying
                ? "Saving..."
                : selectedDraftAlreadyEnteredInPool
                  ? "Draft already entered"
                  : "Enter draft"}
            </button>
            <Link
              href={competitionPath("/drafts", competitionSlug)}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                textDecoration: "none",
                fontWeight: 800,
                background: "var(--surface)",
              }}
            >
              Open Draft Editor
            </Link>
          </div>

          {selectedDraft && !selectedDraftSummary.isValid ? (
            <p style={{ margin: 0, color: "var(--danger)", fontWeight: 800 }}>
              {selectedDraftSummary.error ?? "Invalid draft."}
            </p>
          ) : null}
          {selectedDraftAlreadyEnteredInPool ? (
            <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
              <b>{selectedDraft?.name}</b> is already entered in this pool. Pick a different saved draft.
            </p>
          ) : null}
        </section>
      ) : null}

      {isMember && selectedDraft ? (
        <section
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 8,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>{selectedDraft.name} teams</h2>
          {selectedDraftTeams.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.8 }}>
              This draft has no picks yet. Add teams in <Link href={competitionPath("/drafts", competitionSlug)}>Draft Editor</Link>.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {selectedDraftTeams.map((team) => (
                <div
                  key={team.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    border: "1px solid var(--border-color)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    background: "var(--surface-muted)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {competitionSlug === "world-cup" ? (
                      <span
                        className="world-cup-team-logo"
                        data-empty={worldCupLogoUrl(team.name, team.logo_url) ? undefined : "true"}
                      >
                        {worldCupLogoUrl(team.name, team.logo_url) ? (
                          <img src={worldCupLogoUrl(team.name, team.logo_url) ?? ""} alt="" loading="lazy" />
                        ) : null}
                      </span>
                    ) : null}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {competitionSlug === "world-cup"
                        ? `(${getWorldCupTierForCost(team.cost)?.name ?? "World Cup"}) ${toSchoolDisplayName(team.name)}`
                        : `(${team.seed}) ${toSchoolDisplayName(team.name)}`}
                    </span>
                  </div>
                  <b>{team.cost}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {message ? (
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: 0,
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            padding: "10px 12px",
            background: "var(--surface-muted)",
            fontWeight: 700,
          }}
        >
          {message}
        </p>
      ) : null}
    </main>
  );
}
