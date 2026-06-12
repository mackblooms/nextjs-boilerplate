"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { formatDraftLockTimeET, isDraftLocked } from "@/lib/draftLock";
import { isMissingSavedDraftTablesError, sameTeamSet, type SavedDraftPickRow } from "@/lib/savedDrafts";
import { supabase } from "../../lib/supabaseClient";
import { competitionPath, getCompetition, normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";
import { canUseLegacyMarchMadnessFallback } from "@/lib/competitionData";

type PoolRow = {
  id: string;
  name: string;
  is_private: boolean | null;
  lock_time: string | null;
  competition_slug?: string;
};

type MembershipRow = {
  pool_id: string;
};

type DraftRow = {
  id: string;
  name: string;
  updated_at: string;
};

type LeaveEntryRow = {
  id: string;
  entry_name: string | null;
};

type StatusTone = "success" | "error" | "info";

type StatusMessage = {
  tone: StatusTone;
  text: string;
};

type TabKey = "my" | "discover";

function privacyLabel(pool: PoolRow) {
  return (pool.is_private ?? true) ? "Private" : "Public";
}

function sortPoolsByName(a: PoolRow, b: PoolRow) {
  return a.name.localeCompare(b.name);
}

function sortDraftsByUpdatedAt(a: DraftRow, b: DraftRow) {
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
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

function isPoolEntryLocked(pool: PoolRow, competitionSlug: CompetitionSlug) {
  return isDraftLocked(pool.lock_time ?? null, new Date(), competitionSlug);
}

function lockedEntriesMessage(pool: PoolRow, competitionSlug: CompetitionSlug) {
  return `Draft entries are locked for ${pool.name} (${formatDraftLockTimeET(pool.lock_time, competitionSlug)}).`;
}

function PoolsPageContent() {
  const searchParams = useSearchParams();
  const competitionSlug = normalizeCompetitionSlug(searchParams.get("competition"));
  const competition = getCompetition(competitionSlug);
  const [loading, setLoading] = useState(true);
  const [allPools, setAllPools] = useState<PoolRow[]>([]);
  const [myPools, setMyPools] = useState<PoolRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [query, setQuery] = useState("");
  const [allPoolsMsg, setAllPoolsMsg] = useState("");
  const [myPoolsMsg, setMyPoolsMsg] = useState("");
  const [joinStatus, setJoinStatus] = useState<StatusMessage | null>(null);

  const [joinModalPool, setJoinModalPool] = useState<PoolRow | null>(null);
  const [joinPasswordInput, setJoinPasswordInput] = useState("");
  const [joiningPool, setJoiningPool] = useState(false);

  const [draftModalPool, setDraftModalPool] = useState<PoolRow | null>(null);
  const [draftModalLoading, setDraftModalLoading] = useState(false);
  const [draftModalSubmitting, setDraftModalSubmitting] = useState(false);
  const [draftModalMessage, setDraftModalMessage] = useState("");
  const [availableDrafts, setAvailableDrafts] = useState<DraftRow[]>([]);
  const [draftPickMap, setDraftPickMap] = useState<Map<string, Set<string>>>(new Map());
  const [alreadyEnteredDraftIds, setAlreadyEnteredDraftIds] = useState<Set<string>>(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAllPoolsMsg("");
      setMyPoolsMsg("");
      setJoinStatus(null);

      let { data: allRows, error: allErr } = await supabase
        .from("pools")
        .select("id,name,is_private,lock_time,competition_slug")
        .eq("competition_slug", competitionSlug)
        .order("name", { ascending: true });

      if (canUseLegacyMarchMadnessFallback(competitionSlug, allErr?.message)) {
        const fallback = await supabase
          .from("pools")
          .select("id,name,is_private,lock_time")
          .order("name", { ascending: true });
        allRows = (fallback.data ?? []).map((pool) => ({
          ...pool,
          competition_slug: null,
        }));
        allErr = fallback.error;
      }

      if (allErr) {
        setAllPoolsMsg(allErr.message);
        setMyPoolsMsg(allErr.message);
        setLoading(false);
        return;
      }

      const pools = ((allRows ?? []) as PoolRow[]).sort(sortPoolsByName);
      setAllPools(pools);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setUserId(null);
        setMyPools([]);
        setMyPoolsMsg("Log in to see pools you have joined.");
        setActiveTab("discover");
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data: memberships, error: memberErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id);

      if (memberErr) {
        setMyPools([]);
        setMyPoolsMsg(memberErr.message);
        setLoading(false);
        return;
      }

      const memberPoolIds = new Set((memberships ?? []).map((m) => (m as MembershipRow).pool_id));
      const memberPools = pools.filter((pool) => memberPoolIds.has(pool.id)).sort(sortPoolsByName);
      setMyPools(memberPools);

      if (memberPools.length === 0) {
        setActiveTab("discover");
      }

      setLoading(false);
    };

    void load();
  }, [competitionSlug]);

  const myPoolIds = useMemo(() => new Set(myPools.map((pool) => pool.id)), [myPools]);

  const discoverPools = useMemo(
    () => allPools.filter((pool) => !myPoolIds.has(pool.id)).sort(sortPoolsByName),
    [allPools, myPoolIds],
  );

  const filteredDiscoverPools = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return discoverPools;
    return discoverPools.filter((pool) => pool.name.toLowerCase().includes(needle));
  }, [discoverPools, query]);

  const selectedDraftCount = selectedDraftIds.size;
  const draftModalPoolLocked = draftModalPool ? isPoolEntryLocked(draftModalPool, competitionSlug) : false;

  function rememberJoinedPool(pool: PoolRow) {
    setMyPools((prev) => {
      if (prev.some((row) => row.id === pool.id)) return prev;
      return [...prev, pool].sort(sortPoolsByName);
    });
  }

  function openJoinModal(pool: PoolRow) {
    setJoinStatus(null);

    if (!userId) {
      setJoinStatus({ tone: "error", text: "Log in first to join a pool." });
      return;
    }

    if (myPoolIds.has(pool.id) && isPoolEntryLocked(pool, competitionSlug)) {
      setJoinStatus({ tone: "error", text: lockedEntriesMessage(pool, competitionSlug) });
      return;
    }

    setJoinModalPool(pool);
    setJoinPasswordInput("");
  }

  function closeJoinModal() {
    if (joiningPool) return;
    setJoinModalPool(null);
    setJoinPasswordInput("");
  }

  function closeDraftModal() {
    if (draftModalSubmitting) return;
    setDraftModalPool(null);
    setDraftModalLoading(false);
    setDraftModalSubmitting(false);
    setDraftModalMessage("");
    setAvailableDrafts([]);
    setDraftPickMap(new Map());
    setAlreadyEnteredDraftIds(new Set());
    setSelectedDraftIds(new Set());
  }

  async function loadDraftModal(pool: PoolRow) {
    if (isPoolEntryLocked(pool, competitionSlug)) {
      setDraftModalPool(null);
      setDraftModalLoading(false);
      setDraftModalSubmitting(false);
      setDraftModalMessage("");
      setJoinStatus({ tone: "error", text: lockedEntriesMessage(pool, competitionSlug) });
      return;
    }

    setDraftModalPool(pool);
    setDraftModalLoading(true);
    setDraftModalMessage("");
    setAvailableDrafts([]);
    setDraftPickMap(new Map());
    setAlreadyEnteredDraftIds(new Set());
    setSelectedDraftIds(new Set());

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setDraftModalLoading(false);
      setDraftModalMessage("Please log in first.");
      return;
    }

    let draftsQuery = await supabase
      .from("saved_drafts")
      .select("id,name,updated_at")
      .eq("user_id", user.id)
      .eq("competition_slug", competitionSlug)
      .order("updated_at", { ascending: false });

    if (canUseLegacyMarchMadnessFallback(competitionSlug, draftsQuery.error?.message)) {
      draftsQuery = await supabase
        .from("saved_drafts")
        .select("id,name,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
    }

    if (draftsQuery.error) {
      setDraftModalLoading(false);
      if (isMissingSavedDraftTablesError(draftsQuery.error.message)) {
        setDraftModalMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
        return;
      }
      setDraftModalMessage(draftsQuery.error.message);
      return;
    }

    const drafts = ((draftsQuery.data ?? []) as DraftRow[]).sort(sortDraftsByUpdatedAt);
    setAvailableDrafts(drafts);

    if (drafts.length === 0) {
      setDraftModalLoading(false);
      setDraftModalMessage("No saved drafts yet. Create one first, then come back and join.");
      return;
    }

    const draftIds = drafts.map((draft) => draft.id);
    const picksQuery = await supabase
      .from("saved_draft_picks")
      .select("draft_id,team_id")
      .in("draft_id", draftIds);

    if (picksQuery.error) {
      setDraftModalLoading(false);
      if (isMissingSavedDraftTablesError(picksQuery.error.message)) {
        setDraftModalMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
        return;
      }
      setDraftModalMessage(picksQuery.error.message);
      return;
    }

    const nextPickMap = new Map<string, Set<string>>();
    for (const draftId of draftIds) {
      nextPickMap.set(draftId, new Set());
    }
    for (const row of (picksQuery.data ?? []) as SavedDraftPickRow[]) {
      const picks = nextPickMap.get(row.draft_id) ?? new Set<string>();
      picks.add(row.team_id);
      nextPickMap.set(row.draft_id, picks);
    }

    const entryRowsWithNamesQuery = await supabase
      .from("entries")
      .select("id,entry_name")
      .eq("pool_id", pool.id)
      .eq("user_id", user.id);

    if (entryRowsWithNamesQuery.error && !isMissingEntryNameError(entryRowsWithNamesQuery.error.message)) {
      setDraftModalLoading(false);
      setDraftModalMessage(entryRowsWithNamesQuery.error.message);
      return;
    }

    let entryRows: LeaveEntryRow[] = [];
    if (entryRowsWithNamesQuery.error && isMissingEntryNameError(entryRowsWithNamesQuery.error.message)) {
      const fallbackEntryRowsQuery = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", pool.id)
        .eq("user_id", user.id);

      if (fallbackEntryRowsQuery.error) {
        setDraftModalLoading(false);
        setDraftModalMessage(fallbackEntryRowsQuery.error.message);
        return;
      }

      entryRows = ((fallbackEntryRowsQuery.data ?? []) as Array<{ id: string }>).map((row) => ({
        id: row.id,
        entry_name: null,
      }));
    } else {
      entryRows = (entryRowsWithNamesQuery.data ?? []) as LeaveEntryRow[];
    }

    const entryIds = entryRows.map((row) => row.id);
    const entryPickMap = new Map<string, Set<string>>();
    if (entryIds.length > 0) {
      const entryPicksQuery = await supabase
        .from("entry_picks")
        .select("entry_id,team_id")
        .in("entry_id", entryIds);

      if (entryPicksQuery.error) {
        setDraftModalLoading(false);
        setDraftModalMessage(entryPicksQuery.error.message);
        return;
      }

      for (const entryId of entryIds) entryPickMap.set(entryId, new Set());
      for (const row of (entryPicksQuery.data ?? []) as Array<{ entry_id: string; team_id: string }>) {
        const picks = entryPickMap.get(row.entry_id) ?? new Set<string>();
        picks.add(row.team_id);
        entryPickMap.set(row.entry_id, picks);
      }
    }

    const enteredDrafts = new Set<string>();
    const draftIdsByName = new Map<string, string[]>();
    for (const draft of drafts) {
      const key = normalizeDraftName(draft.name);
      if (!key) continue;
      const list = draftIdsByName.get(key) ?? [];
      list.push(draft.id);
      draftIdsByName.set(key, list);
    }
    for (const entry of entryRows) {
      const matchingDraftIds = draftIdsByName.get(normalizeDraftName(entry.entry_name));
      if (!matchingDraftIds) continue;
      for (const draftId of matchingDraftIds) {
        enteredDrafts.add(draftId);
      }
    }

    for (const draft of drafts) {
      const draftPicks = nextPickMap.get(draft.id) ?? new Set<string>();
      if (draftPicks.size === 0) continue;
      for (const entryPicks of entryPickMap.values()) {
        if (entryPicks.size === 0) continue;
        if (sameTeamSet(draftPicks, entryPicks)) {
          enteredDrafts.add(draft.id);
          break;
        }
      }
    }

    setDraftPickMap(nextPickMap);
    setAlreadyEnteredDraftIds(enteredDrafts);
    setDraftModalLoading(false);
  }

  async function joinPoolThenPickDrafts() {
    const pool = joinModalPool;
    if (!pool) return;

    setJoinStatus(null);
    setJoiningPool(true);
    const entriesLocked = isPoolEntryLocked(pool, competitionSlug);

    if (myPoolIds.has(pool.id)) {
      if (entriesLocked) {
        setJoiningPool(false);
        setJoinStatus({ tone: "error", text: lockedEntriesMessage(pool, competitionSlug) });
        return;
      }
      setJoinModalPool(null);
      setJoinPasswordInput("");
      setJoiningPool(false);
      await loadDraftModal(pool);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setJoiningPool(false);
      setJoinStatus({ tone: "error", text: "Session expired. Log in again to join this pool." });
      return;
    }

    const requiresPassword = (pool.is_private ?? true) !== false;
    const password = joinPasswordInput.trim();

    if (requiresPassword && password.length === 0) {
      setJoiningPool(false);
      setJoinStatus({ tone: "error", text: "Enter the pool password to continue." });
      return;
    }

    const res = await fetch("/api/pools/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        poolId: pool.id,
        password,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };

    if (!res.ok) {
      setJoiningPool(false);
      setJoinStatus({ tone: "error", text: body.error ?? "Failed to join pool." });
      return;
    }

    rememberJoinedPool(pool);
    setActiveTab("my");
    setJoinModalPool(null);
    setJoinPasswordInput("");
    setJoiningPool(false);

    if (entriesLocked) {
      setJoinStatus({ tone: "info", text: `Joined ${pool.name}. ${lockedEntriesMessage(pool, competitionSlug)}` });
      return;
    }

    await loadDraftModal(pool);
  }

  async function createEntry(poolId: string, userIdValue: string, entryName: string, savedDraftId: string): Promise<{ id: string }> {
    const insertWithName = await supabase
      .from("entries")
      .insert({
        pool_id: poolId,
        user_id: userIdValue,
        entry_name: entryName,
        saved_draft_id: savedDraftId,
      })
      .select("id")
      .single();

    if (!insertWithName.error && insertWithName.data) {
      return { id: insertWithName.data.id as string };
    }

    if (!isMissingEntryNameError(insertWithName.error?.message) && !isMissingSavedDraftIdError(insertWithName.error?.message)) {
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
        pool_id: poolId,
        user_id: userIdValue,
        ...(isMissingEntryNameError(insertWithName.error?.message) ? {} : { entry_name: entryName }),
        ...(isMissingSavedDraftIdError(insertWithName.error?.message) ? {} : { saved_draft_id: savedDraftId }),
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

    return { id: insertFallback.data.id as string };
  }

  async function submitSelectedDrafts() {
    const pool = draftModalPool;
    if (!pool) return;

    if (isPoolEntryLocked(pool, competitionSlug)) {
      setDraftModalMessage(lockedEntriesMessage(pool, competitionSlug));
      return;
    }

    if (selectedDraftIds.size === 0) {
      setDraftModalMessage("Select at least one draft.");
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setDraftModalMessage("Please log in first.");
      return;
    }

    const selectedRows = availableDrafts.filter(
      (draft) => selectedDraftIds.has(draft.id) && !alreadyEnteredDraftIds.has(draft.id)
    );

    if (selectedRows.length === 0) {
      setDraftModalMessage("Selected draft(s) are already in this pool.");
      return;
    }

    const lockQuery = await supabase
      .from("pools")
      .select("lock_time")
      .eq("id", pool.id)
      .single();

    if (lockQuery.error) {
      setDraftModalMessage(lockQuery.error.message);
      return;
    }

    const latestLockTime = (lockQuery.data as { lock_time: string | null }).lock_time;
    if (isDraftLocked(latestLockTime, new Date(), competitionSlug)) {
      setDraftModalMessage(`Draft entries are locked for ${pool.name} (${formatDraftLockTimeET(latestLockTime, competitionSlug)}).`);
      return;
    }

    setDraftModalSubmitting(true);
    setDraftModalMessage("");

    let created = 0;
    let skippedEmpty = 0;

    try {
      for (const draft of selectedRows) {
        const draftPickSet = draftPickMap.get(draft.id) ?? new Set<string>();
        const draftPickIds = Array.from(draftPickSet);

        if (draftPickIds.length === 0) {
          skippedEmpty += 1;
          continue;
        }

        const createdEntry = await createEntry(pool.id, user.id, draft.name.trim() || "My Bracket", draft.id);
        const rows = draftPickIds.map((teamId) => ({
          entry_id: createdEntry.id,
          team_id: teamId,
        }));

        const insertPicks = await supabase.from("entry_picks").insert(rows);
        if (insertPicks.error) {
          throw new Error(insertPicks.error.message);
        }
        created += 1;
      }
    } catch (error: unknown) {
      setDraftModalSubmitting(false);
      setDraftModalMessage(error instanceof Error ? error.message : "Failed to enter selected drafts.");
      return;
    }

    setDraftModalSubmitting(false);

    if (created === 0) {
      if (skippedEmpty > 0) {
        setDraftModalMessage(
          "No entries were created because the selected draft(s) have no teams yet. Add picks to your drafts and try again."
        );
      } else {
        setDraftModalMessage("No entries were created. Adjust your selection and try again.");
      }
      return;
    }

    closeDraftModal();
    setJoinStatus({
      tone: "success",
      text:
        `Entered ${created} draft${created === 1 ? "" : "s"} into ${pool.name}.` +
        (skippedEmpty > 0 ? ` Skipped ${skippedEmpty} empty draft${skippedEmpty === 1 ? "" : "s"}.` : ""),
    });
  }

  function toggleDraftSelection(draftId: string) {
    if (alreadyEnteredDraftIds.has(draftId)) return;
    setSelectedDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) {
        next.delete(draftId);
      } else {
        next.add(draftId);
      }
      return next;
    });
  }

  function selectAllDrafts() {
    setSelectedDraftIds(
      new Set(availableDrafts.filter((draft) => !alreadyEnteredDraftIds.has(draft.id)).map((draft) => draft.id))
    );
  }

  function clearDraftSelection() {
    setSelectedDraftIds(new Set());
  }

  const statusStyle =
    joinStatus?.tone === "success"
      ? { background: "var(--success-bg)", borderColor: "var(--border-color)" }
      : joinStatus?.tone === "error"
        ? { background: "var(--danger-bg)", borderColor: "var(--border-color)" }
        : { background: "var(--surface-muted)", borderColor: "var(--border-color)" };

  return (
    <main className="match-shell pools-match-shell">
      <section className="match-app-top" aria-label={`${competition.shortName} pools overview`}>
        <div className="match-topline">
          <div className="match-title-stack">
            <span className="match-kicker">{competition.sport}</span>
            <h1 className="match-title">{competition.shortName} Pools</h1>
            <p className="match-subtitle">
              Track your groups, enter saved drafts, and jump into standings with one scan.
            </p>
          </div>

          <div className="match-actions">
            <Link
              href={competitionPath("/pools/new", competitionSlug)}
              className="native-only-icon-action native-only-icon-action--primary"
              aria-label="Create a new pool"
              title="Create a new pool"
            >
              <span aria-hidden="true" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
                +
              </span>
            </Link>
          </div>
        </div>

        <div className="match-date-strip" aria-label="Pool counts">
          <div className="match-stat-pill">
            <span>Joined</span>
            <strong>{myPools.length}</strong>
          </div>
          <div className="match-stat-pill">
            <span>Available</span>
            <strong>{discoverPools.length}</strong>
          </div>
        </div>

        <div className="match-tabs" role="tablist" aria-label="Pool views">
          <button
            type="button"
            onClick={() => setActiveTab("my")}
            className="match-tab"
            data-active={activeTab === "my"}
            role="tab"
            aria-selected={activeTab === "my"}
          >
            My Pools
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("discover")}
            className="match-tab"
            data-active={activeTab === "discover"}
            role="tab"
            aria-selected={activeTab === "discover"}
          >
            Discover
          </button>
        </div>

        {joinStatus ? (
          <p
            role="status"
            aria-live="polite"
            className="match-status"
            data-tone={joinStatus.tone}
            style={{
              ...statusStyle,
            }}
          >
            {joinStatus.text}
          </p>
        ) : null}
      </section>

      {activeTab === "my" ? (
        <section className="match-section">
          <div className="match-section-header">
            <div>
              <span className="match-section-kicker">Following</span>
              <h2>My Pools</h2>
            </div>
            <span>{myPools.length}</span>
          </div>

          {loading ? <p className="match-empty">Loading pools...</p> : null}
          {myPoolsMsg ? <p className="match-empty">{myPoolsMsg}</p> : null}

          {!loading && !myPoolsMsg && myPools.length === 0 ? (
            <div className="match-empty-card">
              <div className="match-empty-copy">
                <div>Your pool list is still empty.</div>
                <p>
                  Join a pool to start tracking standings, brackets, and draft entries from the app shell.
                </p>
              </div>
              <div className="match-row-actions">
                <button type="button" onClick={() => setActiveTab("discover")} className="ui-btn ui-btn--md ui-btn--primary">
                  Discover pools
                </button>
                <Link href={competitionPath("/drafts", competitionSlug)} className="ui-btn ui-btn--md ui-btn--secondary">
                  Open drafts
                </Link>
                <Link href={competitionPath("/pools/new", competitionSlug)} className="ui-btn ui-btn--md ui-btn--secondary">
                  Create a pool
                </Link>
              </div>
            </div>
          ) : null}

          {!loading && myPools.length > 0 ? (
            <ul className="match-list">
              {myPools.map((pool) => {
                const entriesLocked = isPoolEntryLocked(pool, competitionSlug);
                return (
                  <li key={pool.id}>
                    <article className="match-row">
                      <div className="match-row-main">
                        <span className="match-live-dot" data-locked={entriesLocked} aria-hidden="true" />
                        <div className="match-row-copy">
                          <div className="match-row-title">{pool.name}</div>
                          <div className="match-row-subtitle">
                            {entriesLocked
                              ? `Locked at ${formatDraftLockTimeET(pool.lock_time, competitionSlug)}`
                              : "Entries are open"}
                          </div>
                        </div>
                      </div>
                      <div className="match-row-meta">
                        <span className="match-badge">
                          {privacyLabel(pool)}
                        </span>
                        <span className="match-mini-score">{entriesLocked ? "FT" : "Live"}</span>
                      </div>
                      <div className="match-row-actions">
                        <Link
                          href={`/pool/${pool.id}/leaderboard`}
                          className="match-row-action"
                        >
                          Leaderboard
                        </Link>
                        <Link
                          href={`/pool/${pool.id}/draft`}
                          className="match-row-action match-row-action--accent"
                          style={{
                            opacity: entriesLocked ? 0.7 : 1,
                            pointerEvents: entriesLocked ? "none" : undefined,
                          }}
                          aria-disabled={entriesLocked}
                        >
                          {entriesLocked ? "Entries Locked" : "Enter Drafts"}
                        </Link>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      {activeTab === "discover" ? (
        <section className="match-section">
          <div className="match-section-header">
            <div>
              <span className="match-section-kicker">All Competitions</span>
              <h2>Discover</h2>
            </div>
            <span>{filteredDiscoverPools.length}</span>
          </div>

          <div className="match-search-panel">
            <div className="match-search-label">
              <label htmlFor="pool-search">
                Search pools
              </label>
              <p>
                Find a pool by name, then join it and choose which saved drafts you want to enter.
              </p>
            </div>
            <input
              id="pool-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find by pool name"
              className="match-search-input"
            />
            {!userId ? (
              <p className="match-search-hint">
                Log in to join pools and enter drafts.
              </p>
            ) : null}
          </div>

          {allPoolsMsg ? <p className="match-empty">{allPoolsMsg}</p> : null}
          {!loading && !allPoolsMsg && filteredDiscoverPools.length === 0 ? (
            <div className="match-empty-card">
              {query.trim() ? "No pools match your search." : "No pools are available to join right now."}
            </div>
          ) : null}

          {!loading && filteredDiscoverPools.length > 0 ? (
            <ul className="match-list">
              {filteredDiscoverPools.map((pool) => {
                const isPrivate = (pool.is_private ?? true) !== false;

                return (
                  <li key={pool.id}>
                    <div className="match-row">
                      <div className="match-row-main">
                        <span className="match-live-dot" data-locked={isPrivate} aria-hidden="true" />
                        <div className="match-row-copy">
                          <div className="match-row-title">{pool.name}</div>
                          <div className="match-row-subtitle">
                            {isPrivate ? "Private pool with password protection" : "Public pool ready to join"}
                          </div>
                        </div>
                      </div>
                      <div className="match-row-meta">
                        <span className="match-badge" data-open={!isPrivate}>
                          {isPrivate ? "Private" : "Public"}
                        </span>
                        <span className="match-mini-score">Join</span>
                      </div>

                      <div className="match-row-actions">
                        <button
                          type="button"
                          onClick={() => openJoinModal(pool)}
                          disabled={!userId}
                          className="match-row-action match-row-action--accent"
                        >
                          Join + Enter Drafts
                        </button>
                        <Link
                          href={`/pool/${pool.id}/leaderboard`}
                          className="match-row-action"
                        >
                          Preview Leaderboard
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      {joinModalPool ? (
        <div
          role="presentation"
          onClick={closeJoinModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 120,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Join pool"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              padding: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
              {myPoolIds.has(joinModalPool.id) ? `Enter Drafts in ${joinModalPool.name}` : `Join ${joinModalPool.name}`}
            </h2>
            <p style={{ margin: 0, opacity: 0.8 }}>
              {myPoolIds.has(joinModalPool.id)
                ? "You are already in this pool. Continue to choose one or more drafts to enter."
                : isPoolEntryLocked(joinModalPool, competitionSlug)
                ? "You can still join this pool, but draft entry and leave are locked."
                : (joinModalPool.is_private ?? true) !== false
                ? "Enter the pool password to continue."
                : "This is a public pool. Continue to pick which drafts to enter."}
            </p>

            {(joinModalPool.is_private ?? true) !== false && !myPoolIds.has(joinModalPool.id) ? (
              <input
                type="password"
                value={joinPasswordInput}
                onChange={(event) => setJoinPasswordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !joiningPool) {
                    void joinPoolThenPickDrafts();
                  }
                }}
                placeholder="Pool password"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface-muted)",
                }}
              />
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeJoinModal}
                disabled={joiningPool}
                style={{
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 800,
                  cursor: joiningPool ? "not-allowed" : "pointer",
                  opacity: joiningPool ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void joinPoolThenPickDrafts()}
                disabled={joiningPool}
                style={{
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 900,
                  cursor: joiningPool ? "not-allowed" : "pointer",
                  opacity: joiningPool ? 0.7 : 1,
                }}
              >
                {joiningPool ? "Joining..." : isPoolEntryLocked(joinModalPool, competitionSlug) ? "Join Pool" : "Continue"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {draftModalPool ? (
        <div
          role="presentation"
          onClick={closeDraftModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 125,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Select drafts to enter"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(640px, 100%)",
              maxHeight: "88vh",
              overflow: "auto",
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              padding: 14,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Enter Drafts in {draftModalPool.name}</h2>
              <p style={{ margin: 0, opacity: 0.8 }}>
                Select one or more drafts below. Each selected draft creates its own entry in this pool.
              </p>
            </div>

            {draftModalLoading ? <p style={{ margin: 0 }}>Loading your drafts...</p> : null}

            {!draftModalLoading && availableDrafts.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={selectAllDrafts}
                    disabled={draftModalSubmitting || draftModalPoolLocked}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: draftModalSubmitting || draftModalPoolLocked ? "not-allowed" : "pointer",
                      opacity: draftModalSubmitting || draftModalPoolLocked ? 0.7 : 1,
                    }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearDraftSelection}
                    disabled={draftModalSubmitting || draftModalPoolLocked}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: draftModalSubmitting || draftModalPoolLocked ? "not-allowed" : "pointer",
                      opacity: draftModalSubmitting || draftModalPoolLocked ? 0.7 : 1,
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {availableDrafts.map((draft) => {
                    const picks = draftPickMap.get(draft.id);
                    const pickCount = picks?.size ?? 0;
                    const isAlreadyEntered = alreadyEnteredDraftIds.has(draft.id);
                    const checked = isAlreadyEntered || selectedDraftIds.has(draft.id);

                    return (
                      <label
                        key={draft.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          padding: "10px 12px",
                          background: checked ? "var(--surface-elevated)" : "var(--surface)",
                          cursor: isAlreadyEntered ? "not-allowed" : "pointer",
                          opacity: isAlreadyEntered ? 0.75 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDraftSelection(draft.id)}
                          disabled={draftModalSubmitting || isAlreadyEntered || draftModalPoolLocked}
                        />
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 900 }}>
                            {draft.name}
                            {isAlreadyEntered ? " (already entered)" : ""}
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            {pickCount} team{pickCount === 1 ? "" : "s"} selected
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {!draftModalLoading && availableDrafts.length === 0 ? (
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-muted)",
                  padding: "10px 12px",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>No drafts available.</p>
                <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
                  Open <Link href={competitionPath("/drafts", competitionSlug)}>My Drafts</Link> to create one.
                </p>
              </div>
            ) : null}

            {draftModalMessage ? (
              <p
                style={{
                  margin: 0,
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-muted)",
                  padding: "10px 12px",
                  fontWeight: 700,
                }}
              >
                {draftModalMessage}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
              <Link
                href={competitionPath("/drafts", competitionSlug)}
                onClick={closeDraftModal}
                style={{
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  background: "var(--surface)",
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Manage Drafts
              </Link>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={closeDraftModal}
                  disabled={draftModalSubmitting}
                  style={{
                    padding: "10px 12px",
                    minHeight: 44,
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    fontWeight: 800,
                    cursor: draftModalSubmitting ? "not-allowed" : "pointer",
                    opacity: draftModalSubmitting ? 0.7 : 1,
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void submitSelectedDrafts()}
                  disabled={draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading || draftModalPoolLocked}
                  style={{
                    padding: "10px 12px",
                    minHeight: 44,
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    fontWeight: 900,
                    cursor:
                      draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading || draftModalPoolLocked
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading || draftModalPoolLocked
                        ? 0.7
                        : 1,
                  }}
                >
                  {draftModalSubmitting
                    ? "Entering..."
                    : `Enter ${selectedDraftCount} Draft${selectedDraftCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default function PoolsPage() {
  return (
    <Suspense fallback={null}>
      <PoolsPageContent />
    </Suspense>
  );
}
