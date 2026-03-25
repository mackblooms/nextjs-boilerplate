"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { trySetEntryName } from "@/lib/poolEntry";
import { formatDraftLockTimeET, isDraftLocked, resolveDraftLockTime } from "@/lib/draftLock";
import { trackEvent } from "@/lib/analytics";
import {
  sortDraftTeamsBySeedName,
  summarizeDraft,
  type DraftableTeam,
  DRAFT_BUDGET,
  MAX_14_TO_16_SEEDS,
  MAX_1_SEEDS,
  MAX_2_SEEDS,
} from "@/lib/draftRules";
import {
  isMissingSavedDraftTablesError,
  sameTeamSet,
  type SavedDraftPickRow,
  type SavedDraftRow,
} from "@/lib/savedDrafts";

type PoolRow = {
  id: string;
  name: string;
  is_private: boolean | null;
  lock_time: string | null;
};

type TeamRow = DraftableTeam & {
  logo_url: string | null;
};

type DraftRow = Pick<SavedDraftRow, "id" | "name" | "created_at" | "updated_at">;

type GameRow = {
  round: string;
  team1_id: string | null;
  team2_id: string | null;
};

type EntryPickRow = {
  team_id: string;
};

type EntryRow = {
  id: string;
  entry_name: string | null;
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

function entryLabel(entry: EntryRow, index: number) {
  const trimmed = entry.entry_name?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;
  return `Entry ${index + 1}`;
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

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [pool, setPool] = useState<PoolRow | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [existingEntries, setExistingEntries] = useState<EntryRow[]>([]);
  const [targetEntryId, setTargetEntryId] = useState("");

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [pickMap, setPickMap] = useState<Map<string, Set<string>>>(new Map());
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [poolAppliedTeamIds, setPoolAppliedTeamIds] = useState<Set<string>>(new Set());

  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);
  const [applying, setApplying] = useState(false);

  const [locked, setLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);

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
        .sort(sortDraftTeamsBySeedName) as TeamRow[],
    [selectedDraftPicks, teamById]
  );

  const selectedDraftSummary = useMemo(
    () => summarizeDraft(selectedDraftPicks, teamById),
    [selectedDraftPicks, teamById]
  );

  const targetEntry = useMemo(
    () => existingEntries.find((entry) => entry.id === targetEntryId) ?? null,
    [existingEntries, targetEntryId]
  );

  const appliedDraft = useMemo(
    () =>
      drafts.find((draft) => {
        const draftPickSet = pickMap.get(draft.id) ?? new Set<string>();
        return sameTeamSet(draftPickSet, poolAppliedTeamIds);
      }) ?? null,
    [drafts, pickMap, poolAppliedTeamIds]
  );

  const selectedIsApplied = useMemo(
    () => targetEntryId.length > 0 && sameTeamSet(selectedDraftPicks, poolAppliedTeamIds),
    [selectedDraftPicks, poolAppliedTeamIds, targetEntryId]
  );

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

    const { data: poolRow, error: poolErr } = await supabase
      .from("pools")
      .select("id,name,is_private,lock_time")
      .eq("id", poolId)
      .single();

    if (poolErr) {
      setLoading(false);
      setMessage(poolErr.message);
      return;
    }

    const typedPool = poolRow as PoolRow;
    setPool(typedPool);
    setLockTime(resolveDraftLockTime(typedPool.lock_time ?? null));
    setLocked(isDraftLocked(typedPool.lock_time ?? null));

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

    const { data: gameRows, error: gameErr } = await supabase
      .from("games")
      .select("round,team1_id,team2_id");

    if (gameErr) {
      setLoading(false);
      setMessage(gameErr.message);
      return;
    }

    const r64TeamIds = Array.from(
      new Set(
        ((gameRows ?? []) as GameRow[])
          .filter((g) => g.round === "R64")
          .flatMap((g) => [g.team1_id, g.team2_id])
          .filter((id): id is string => Boolean(id))
      )
    );

    let teamQuery = supabase.from("teams").select("id,name,seed,cost,logo_url");
    if (r64TeamIds.length > 0) {
      teamQuery = teamQuery.in("id", r64TeamIds);
    }

    const { data: teamRows, error: teamErr } = await teamQuery;
    if (teamErr) {
      setLoading(false);
      setMessage(teamErr.message);
      return;
    }
    setTeams(((teamRows ?? []) as TeamRow[]).sort(sortDraftTeamsBySeedName));

    if (!memRow) {
      setExistingEntries([]);
      setTargetEntryId("");
      setPoolAppliedTeamIds(new Set());
      setLoading(false);
      return;
    }

    const entriesWithNames = await supabase
      .from("entries")
      .select("id,entry_name")
      .eq("pool_id", poolId)
      .eq("user_id", user.id);

    let nextEntries: EntryRow[] = [];
    if (entriesWithNames.error && !isMissingEntryNameError(entriesWithNames.error.message)) {
      setLoading(false);
      setMessage(entriesWithNames.error.message);
      return;
    }

    if (entriesWithNames.error && isMissingEntryNameError(entriesWithNames.error.message)) {
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
      }));
    } else {
      nextEntries = (entriesWithNames.data ?? []) as EntryRow[];
    }

    setExistingEntries(nextEntries);
    setTargetEntryId("");
    setPoolAppliedTeamIds(new Set());

    const draftRowsQuery = await supabase
      .from("saved_drafts")
      .select("id,user_id,name,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

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
    setSelectedDraftId(nextDraftRows[0]?.id ?? "");

    setLoading(false);
  }, [poolId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let canceled = false;

    const loadTargetEntryPicks = async () => {
      if (!isMember || !targetEntryId) {
        if (!canceled) setPoolAppliedTeamIds(new Set());
        return;
      }

      const { data: poolPickRows, error: poolPicksErr } = await supabase
        .from("entry_picks")
        .select("team_id")
        .eq("entry_id", targetEntryId);

      if (poolPicksErr) {
        if (!canceled) setMessage(poolPicksErr.message);
        return;
      }

      if (!canceled) {
        setPoolAppliedTeamIds(new Set(((poolPickRows ?? []) as EntryPickRow[]).map((row) => row.team_id)));
      }
    };

    void loadTargetEntryPicks();
    return () => {
      canceled = true;
    };
  }, [isMember, targetEntryId]);

  async function createPoolEntry(poolIdValue: string, userId: string, entryName: string): Promise<EntryRow> {
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
      return { id: row.id, entry_name: row.entry_name };
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

    return { id: insertFallback.data.id as string, entry_name: null };
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

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setMessage("Please log in first.");
      return;
    }

    setApplying(true);
    setMessage("");

    const isUpdatingExisting = targetEntryId.trim().length > 0;
    let resolvedEntryId = targetEntryId.trim();
    let createdEntry: EntryRow | null = null;

    if (!isUpdatingExisting) {
      try {
        createdEntry = await createPoolEntry(poolId, user.id, selectedDraft.name);
        resolvedEntryId = createdEntry.id;
      } catch (error: unknown) {
        setApplying(false);
        setMessage(error instanceof Error ? error.message : "Failed to create pool entry.");
        return;
      }
    }

    trackEvent({
      eventName: "pool_draft_apply_attempt",
      poolId,
      entryId: resolvedEntryId,
      metadata: {
        mode: isUpdatingExisting ? "update_existing_entry" : "create_new_entry",
        draft_id: selectedDraft.id,
        selected_count: selectedDraftPicks.size,
        total_cost: selectedDraftSummary.totalCost,
      },
    });

    if (isUpdatingExisting) {
      const { error: clearErr } = await supabase
        .from("entry_picks")
        .delete()
        .eq("entry_id", resolvedEntryId);

      if (clearErr) {
        setApplying(false);
        setMessage(clearErr.message);
        trackEvent({
          eventName: "pool_draft_apply_failure",
          poolId,
          entryId: resolvedEntryId,
          metadata: { draft_id: selectedDraft.id, reason: clearErr.message },
        });
        return;
      }
    }

    const rows = Array.from(selectedDraftPicks).map((teamId) => ({
      entry_id: resolvedEntryId,
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
          entryId: resolvedEntryId,
          metadata: { draft_id: selectedDraft.id, reason: insertErr.message },
        });
        return;
      }
    }

    if (isUpdatingExisting) {
      const entryNameErr = await trySetEntryName(supabase, resolvedEntryId, selectedDraft.name);
      if (entryNameErr) {
        setApplying(false);
        setMessage(entryNameErr);
        return;
      }
    }

    if (createdEntry) {
      setExistingEntries((prev) => [...prev, createdEntry]);
      setTargetEntryId("");
      setPoolAppliedTeamIds(new Set());
    } else {
      setPoolAppliedTeamIds(new Set(selectedDraftPicks));
      setExistingEntries((prev) =>
        prev.map((entry) =>
          entry.id === resolvedEntryId ? { ...entry, entry_name: selectedDraft.name } : entry
        )
      );
    }

    const targetEntryIndex = targetEntry
      ? existingEntries.findIndex((entry) => entry.id === targetEntry.id)
      : -1;
    const selectedEntryLabel = targetEntry
      ? entryLabel(targetEntry, targetEntryIndex >= 0 ? targetEntryIndex : 0)
      : "Selected entry";

    setApplying(false);
    setMessage(
      createdEntry
        ? `Entered "${selectedDraft.name}" as a new entry in ${pool?.name ?? "this pool"}.`
        : `Updated "${selectedEntryLabel}" with "${selectedDraft.name}".`
    );
    trackEvent({
      eventName: "pool_draft_apply_success",
      poolId,
      entryId: resolvedEntryId,
      metadata: {
        mode: isUpdatingExisting ? "update_existing_entry" : "create_new_entry",
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
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          background: "var(--surface)",
          padding: 14,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{pool?.name ?? "Pool"}</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.85 }}>
              Enter saved drafts into this pool. You can create multiple entries.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/drafts"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                textDecoration: "none",
                fontWeight: 800,
                background: "var(--surface)",
              }}
            >
              Edit Drafts
            </Link>
            <Link
              href={`/pool/${poolId}/leaderboard`}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                textDecoration: "none",
                fontWeight: 800,
                background: "var(--surface)",
              }}
            >
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
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>Lock time: {formatDraftLockTimeET(lockTime)}</p>
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
              style={{
                width: "100%",
                maxWidth: 380,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            />
          ) : null}
          <button
            type="button"
            onClick={() => void joinPool()}
            disabled={joining}
            style={{
              width: "100%",
              maxWidth: 240,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              fontWeight: 900,
              cursor: joining ? "not-allowed" : "pointer",
              opacity: joining ? 0.7 : 1,
            }}
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
              style={{
                width: "100%",
                maxWidth: 420,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            >
              {drafts.length === 0 ? <option value="">No drafts available</option> : null}
              {drafts.map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <label htmlFor="pool-entry-target-select" style={{ fontWeight: 800, fontSize: 13 }}>
              Entry target
            </label>
            <select
              id="pool-entry-target-select"
              value={targetEntryId}
              onChange={(event) => setTargetEntryId(event.target.value)}
              style={{
                width: "100%",
                maxWidth: 420,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            >
              <option value="">Create new pool entry</option>
              {existingEntries.map((entry, index) => (
                <option key={entry.id} value={entry.id}>
                  {entryLabel(entry, index)}
                </option>
              ))}
            </select>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
              Keep the default to add a new entry, or choose an existing entry to replace its picks.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void applyDraftToPool()}
              disabled={applying || !selectedDraft || locked || !selectedDraftSummary.isValid || drafts.length === 0}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                fontWeight: 900,
                cursor:
                  applying || !selectedDraft || locked || !selectedDraftSummary.isValid || drafts.length === 0
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  applying || !selectedDraft || locked || !selectedDraftSummary.isValid || drafts.length === 0
                    ? 0.7
                    : 1,
              }}
            >
              {applying
                ? "Saving..."
                : targetEntryId
                  ? selectedIsApplied
                    ? "Re-apply draft to selected entry"
                    : "Update selected entry"
                  : "Enter draft as new entry"}
            </button>
            <Link
              href="/drafts"
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

          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              padding: "10px 12px",
              background:
                !selectedDraft
                  ? "var(--surface-muted)"
                  : selectedDraftSummary.isValid
                    ? "var(--success-bg)"
                    : "var(--danger-bg)",
              fontWeight: 800,
            }}
          >
            {selectedDraft
              ? `Draft "${selectedDraft.name}" - ${selectedDraftPicks.size} teams - ${selectedDraftSummary.totalCost}/${DRAFT_BUDGET}`
              : "No saved drafts yet. Create one in Draft Editor first."}
            {selectedDraft && !selectedDraftSummary.isValid
              ? ` - ${selectedDraftSummary.error ?? "Invalid draft."}`
              : ""}
          </div>

          <div style={{ display: "grid", gap: 6, fontSize: 13, opacity: 0.8 }}>
            <div>
              Rules: max {MAX_1_SEEDS} one-seeds, max {MAX_2_SEEDS} two-seeds, max {MAX_14_TO_16_SEEDS} seeds
              14-16.
            </div>
            {targetEntry ? (
              <div>
                Selected entry currently matches:{" "}
                <b>{appliedDraft ? appliedDraft.name : poolAppliedTeamIds.size > 0 ? "Custom / unsaved mix" : "None"}</b>
              </div>
            ) : (
              <div>
                You are creating a new entry. Existing entries remain unchanged.
              </div>
            )}
          </div>
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
              This draft has no picks yet. Add teams in <Link href="/drafts">Draft Editor</Link>.
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
                    background: poolAppliedTeamIds.has(team.id) ? "var(--highlight)" : "var(--surface-muted)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    {team.logo_url ? (
                      <img
                        src={team.logo_url}
                        alt={team.name}
                        width={20}
                        height={20}
                        style={{ width: 20, height: 20, objectFit: "contain", flexShrink: 0 }}
                      />
                    ) : (
                      <span style={{ width: 20, height: 20, flexShrink: 0 }} />
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      ({team.seed}) {team.name}
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
