"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { isMissingSavedDraftTablesError, type SavedDraftPickRow } from "@/lib/savedDrafts";
import { supabase } from "../../lib/supabaseClient";

type PoolRow = {
  id: string;
  name: string;
  is_private: boolean | null;
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

export default function PoolsPage() {
  const [loading, setLoading] = useState(true);
  const [allPools, setAllPools] = useState<PoolRow[]>([]);
  const [myPools, setMyPools] = useState<PoolRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("my");
  const [query, setQuery] = useState("");
  const [allPoolsMsg, setAllPoolsMsg] = useState("");
  const [myPoolsMsg, setMyPoolsMsg] = useState("");
  const [joinStatus, setJoinStatus] = useState<StatusMessage | null>(null);
  const [leavingPoolId, setLeavingPoolId] = useState<string | null>(null);

  const [joinModalPool, setJoinModalPool] = useState<PoolRow | null>(null);
  const [joinPasswordInput, setJoinPasswordInput] = useState("");
  const [joiningPool, setJoiningPool] = useState(false);

  const [draftModalPool, setDraftModalPool] = useState<PoolRow | null>(null);
  const [draftModalLoading, setDraftModalLoading] = useState(false);
  const [draftModalSubmitting, setDraftModalSubmitting] = useState(false);
  const [draftModalMessage, setDraftModalMessage] = useState("");
  const [availableDrafts, setAvailableDrafts] = useState<DraftRow[]>([]);
  const [draftPickMap, setDraftPickMap] = useState<Map<string, Set<string>>>(new Map());
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());

  const [leaveModalPool, setLeaveModalPool] = useState<PoolRow | null>(null);
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntryRow[]>([]);
  const [selectedLeaveEntryIds, setSelectedLeaveEntryIds] = useState<Set<string>>(new Set());
  const [leaveModalLoading, setLeaveModalLoading] = useState(false);
  const [leaveModalSubmitting, setLeaveModalSubmitting] = useState(false);
  const [leaveModalMessage, setLeaveModalMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setAllPoolsMsg("");
      setMyPoolsMsg("");
      setJoinStatus(null);

      const { data: allRows, error: allErr } = await supabase
        .from("pools")
        .select("id,name,is_private")
        .order("name", { ascending: true });

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
  }, []);

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
  const selectedLeaveCount = selectedLeaveEntryIds.size;

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
    setSelectedDraftIds(new Set());
  }

  async function loadDraftModal(pool: PoolRow) {
    setDraftModalPool(pool);
    setDraftModalLoading(true);
    setDraftModalMessage("");
    setAvailableDrafts([]);
    setDraftPickMap(new Map());
    setSelectedDraftIds(new Set());

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setDraftModalLoading(false);
      setDraftModalMessage("Please log in first.");
      return;
    }

    const draftsQuery = await supabase
      .from("saved_drafts")
      .select("id,name,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

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

    setDraftPickMap(nextPickMap);
    setDraftModalLoading(false);
  }

  async function joinPoolThenPickDrafts() {
    const pool = joinModalPool;
    if (!pool) return;

    setJoinStatus(null);
    setJoiningPool(true);

    if (myPoolIds.has(pool.id)) {
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
    await loadDraftModal(pool);
  }

  async function createEntry(poolId: string, userIdValue: string, entryName: string): Promise<{ id: string }> {
    const insertWithName = await supabase
      .from("entries")
      .insert({
        pool_id: poolId,
        user_id: userIdValue,
        entry_name: entryName,
      })
      .select("id")
      .single();

    if (!insertWithName.error && insertWithName.data) {
      return { id: insertWithName.data.id as string };
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
        pool_id: poolId,
        user_id: userIdValue,
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

    setDraftModalSubmitting(true);
    setDraftModalMessage("");

    let created = 0;
    let skippedEmpty = 0;

    const selectedRows = availableDrafts.filter((draft) => selectedDraftIds.has(draft.id));

    try {
      for (const draft of selectedRows) {
        const draftPickSet = draftPickMap.get(draft.id) ?? new Set<string>();
        const draftPickIds = Array.from(draftPickSet);

        if (draftPickIds.length === 0) {
          skippedEmpty += 1;
          continue;
        }

        const createdEntry = await createEntry(pool.id, user.id, draft.name.trim() || "My Bracket");
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
    setSelectedDraftIds(new Set(availableDrafts.map((draft) => draft.id)));
  }

  function clearDraftSelection() {
    setSelectedDraftIds(new Set());
  }

  function closeLeaveModal() {
    setLeaveModalPool(null);
    setLeaveEntries([]);
    setSelectedLeaveEntryIds(new Set());
    setLeaveModalLoading(false);
    setLeaveModalSubmitting(false);
    setLeaveModalMessage("");
  }

  async function openLeaveModal(pool: PoolRow) {
    setJoinStatus(null);

    if (!userId) {
      setJoinStatus({ tone: "error", text: "Log in first to leave a pool." });
      return;
    }

    setLeaveModalPool(pool);
    setLeaveEntries([]);
    setSelectedLeaveEntryIds(new Set());
    setLeaveModalLoading(true);
    setLeaveModalSubmitting(false);
    setLeaveModalMessage("");

    const withName = await supabase
      .from("entries")
      .select("id,entry_name")
      .eq("pool_id", pool.id)
      .eq("user_id", userId);

    if (withName.error && !isMissingEntryNameError(withName.error.message)) {
      setLeaveModalLoading(false);
      setLeaveModalMessage(withName.error.message);
      return;
    }

    if (withName.error && isMissingEntryNameError(withName.error.message)) {
      const fallback = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", pool.id)
        .eq("user_id", userId);

      if (fallback.error) {
        setLeaveModalLoading(false);
        setLeaveModalMessage(fallback.error.message);
        return;
      }

      const rows = ((fallback.data ?? []) as Array<{ id: string }>).map((row) => ({
        id: row.id,
        entry_name: null,
      }));
      setLeaveEntries(rows);
      setLeaveModalLoading(false);
      return;
    }

    setLeaveEntries((withName.data ?? []) as LeaveEntryRow[]);
    setLeaveModalLoading(false);
  }

  function toggleLeaveEntrySelection(entryId: string) {
    setSelectedLeaveEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  }

  function selectAllLeaveEntries() {
    setSelectedLeaveEntryIds(new Set(leaveEntries.map((entry) => entry.id)));
  }

  function clearLeaveSelection() {
    setSelectedLeaveEntryIds(new Set());
  }

  async function submitLeaveSelection() {
    const pool = leaveModalPool;
    if (!pool) return;

    if (!userId) {
      setLeaveModalMessage("Please log in first.");
      return;
    }

    const entryIds = Array.from(selectedLeaveEntryIds);
    if (leaveEntries.length > 0 && entryIds.length === 0) {
      setLeaveModalMessage("Select at least one draft to remove.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLeaveModalMessage("Session expired. Log in again to leave this pool.");
      return;
    }

    setLeavingPoolId(pool.id);
    setLeaveModalSubmitting(true);
    setLeaveModalMessage("");

    const res = await fetch("/api/pools/leave", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        poolId: pool.id,
        entryIds: entryIds.length > 0 ? entryIds : undefined,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      removedEntryIds?: string[];
      membershipRemoved?: boolean;
    };

    if (!res.ok) {
      setLeavingPoolId(null);
      setLeaveModalSubmitting(false);
      setLeaveModalMessage(body.error ?? "Failed to remove selected drafts.");
      return;
    }

    const removedEntryIds = new Set(body.removedEntryIds ?? []);
    const remainingEntries = leaveEntries.filter((entry) => !removedEntryIds.has(entry.id));

    if (body.membershipRemoved) {
      setMyPools((prev) => {
        const next = prev.filter((row) => row.id !== pool.id);
        if (next.length === 0) {
          setActiveTab("discover");
        }
        return next;
      });
      setLeavingPoolId(null);
      setLeaveModalSubmitting(false);
      closeLeaveModal();
      setJoinStatus({ tone: "success", text: `Left ${pool.name}.` });
      return;
    }

    setLeaveEntries(remainingEntries);
    setSelectedLeaveEntryIds(new Set());
    setLeavingPoolId(null);
    setLeaveModalSubmitting(false);
    setLeaveModalMessage("Removed selected draft(s) from this pool.");
  }

  function leaveEntryLabel(entry: LeaveEntryRow, index: number) {
    const trimmed = entry.entry_name?.trim() ?? "";
    if (trimmed.length > 0) return trimmed;
    return `Draft ${index + 1}`;
  }

  const tabButton = (isActive: boolean): CSSProperties => ({
    padding: "10px 14px",
    border: "1px solid var(--border-color)",
    borderRadius: 10,
    background: isActive ? "var(--surface-elevated)" : "var(--surface)",
    fontWeight: 800,
    cursor: "pointer",
  });

  const statusStyle: CSSProperties =
    joinStatus?.tone === "success"
      ? { background: "var(--success-bg)", borderColor: "var(--border-color)" }
      : joinStatus?.tone === "error"
        ? { background: "var(--danger-bg)", borderColor: "var(--border-color)" }
        : { background: "var(--surface-muted)", borderColor: "var(--border-color)" };

  return (
    <main style={{ maxWidth: 960, margin: "90px auto", padding: 16, display: "grid", gap: 18 }}>
      <section
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          background: "var(--surface)",
          padding: 14,
          display: "grid",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Pools</h1>
            <p style={{ margin: 0, opacity: 0.8 }}>
              Join a pool, then select one or more saved drafts to enter.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/drafts"
              style={{
                padding: "10px 14px",
                border: "1px solid var(--border-color)",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 900,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                background: "var(--surface)",
              }}
            >
              My Drafts
            </Link>
            <Link
              href="/pools/new"
              style={{
                padding: "10px 14px",
                border: "1px solid var(--border-color)",
                borderRadius: 10,
                textDecoration: "none",
                fontWeight: 900,
                minHeight: 44,
                display: "inline-flex",
                alignItems: "center",
                background: "var(--surface)",
              }}
            >
              New Pool
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setActiveTab("my")} style={tabButton(activeTab === "my")}>
            My Pools ({myPools.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("discover")}
            style={tabButton(activeTab === "discover")}
          >
            Discover & Join ({discoverPools.length})
          </button>
        </div>

        {joinStatus ? (
          <p
            role="status"
            aria-live="polite"
            style={{
              margin: 0,
              border: "1px solid",
              borderRadius: 10,
              padding: "10px 12px",
              fontWeight: 700,
              ...statusStyle,
            }}
          >
            {joinStatus.text}
          </p>
        ) : null}
      </section>

      {activeTab === "my" ? (
        <section style={{ display: "grid", gap: 10 }}>
          {loading ? <p>Loading pools...</p> : null}
          {myPoolsMsg ? <p>{myPoolsMsg}</p> : null}

          {!loading && !myPoolsMsg && myPools.length === 0 ? (
            <div
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                padding: 12,
                background: "var(--surface)",
                display: "grid",
                gap: 8,
              }}
            >
              <p style={{ margin: 0 }}>You have not joined any pools yet.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setActiveTab("discover")}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Discover pools
                </button>
                <Link
                  href="/drafts"
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    textDecoration: "none",
                    fontWeight: 800,
                    background: "var(--surface)",
                  }}
                >
                  Open drafts
                </Link>
                <Link
                  href="/pools/new"
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    textDecoration: "none",
                    fontWeight: 800,
                    background: "var(--surface)",
                  }}
                >
                  Create a pool
                </Link>
              </div>
            </div>
          ) : null}

          {!loading && myPools.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {myPools.map((pool) => (
                <li key={pool.id}>
                  <div
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: 12,
                      padding: 12,
                      background: "var(--surface)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                      <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{pool.name}</div>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>{privacyLabel(pool)} pool</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => openJoinModal(pool)}
                        disabled={!userId}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 10,
                          border: "1px solid #16a34a",
                          fontWeight: 800,
                          background: "rgba(22,163,74,0.12)",
                          color: "#166534",
                          minHeight: 40,
                          cursor: !userId ? "not-allowed" : "pointer",
                          opacity: !userId ? 0.7 : 1,
                        }}
                      >
                        Enter Drafts
                      </button>
                      <Link
                        href={`/pool/${pool.id}/leaderboard`}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 10,
                          border: "1px solid var(--border-color)",
                          textDecoration: "none",
                          fontWeight: 800,
                          background: "var(--surface)",
                          minHeight: 40,
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        Leaderboard
                      </Link>
                      <button
                        type="button"
                        onClick={() => void openLeaveModal(pool)}
                        disabled={leavingPoolId === pool.id}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 10,
                          border: "1px solid #dc2626",
                          fontWeight: 800,
                          background: "rgba(220,38,38,0.12)",
                          color: "#dc2626",
                          minHeight: 40,
                          cursor: leavingPoolId === pool.id ? "not-allowed" : "pointer",
                          opacity: leavingPoolId === pool.id ? 0.7 : 1,
                        }}
                      >
                        {leavingPoolId === pool.id ? "Leaving..." : "Leave"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {activeTab === "discover" ? (
        <section style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              background: "var(--surface)",
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <label htmlFor="pool-search" style={{ fontWeight: 800, fontSize: 13 }}>
              Search pools
            </label>
            <input
              id="pool-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find by pool name"
              style={{
                width: "100%",
                padding: "10px 12px",
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            />
            {!userId ? (
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                Log in to join pools and enter drafts.
              </p>
            ) : null}
          </div>

          {allPoolsMsg ? <p>{allPoolsMsg}</p> : null}
          {!loading && !allPoolsMsg && filteredDiscoverPools.length === 0 ? (
            <p>{query.trim() ? "No pools match your search." : "No pools available to join right now."}</p>
          ) : null}

          {!loading && filteredDiscoverPools.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {filteredDiscoverPools.map((pool) => {
                const isPrivate = (pool.is_private ?? true) !== false;

                return (
                  <li key={pool.id}>
                    <div
                      style={{
                        border: "1px solid var(--border-color)",
                        borderRadius: 12,
                        padding: 12,
                        background: "var(--surface)",
                        display: "grid",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                          <div style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>{pool.name}</div>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            {isPrivate ? "Private (password required)" : "Public"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => openJoinModal(pool)}
                          disabled={!userId}
                          style={{
                            flex: "1 1 160px",
                            padding: "10px 12px",
                            minHeight: 44,
                            borderRadius: 10,
                            border: "1px solid #16a34a",
                            background: "rgba(22,163,74,0.12)",
                            color: "#166534",
                            fontWeight: 800,
                            cursor: !userId ? "not-allowed" : "pointer",
                            opacity: !userId ? 0.7 : 1,
                          }}
                        >
                          Join + Enter Drafts
                        </button>
                        <Link
                          href={`/pool/${pool.id}/leaderboard`}
                          style={{
                            flex: "1 1 160px",
                            padding: "10px 12px",
                            minHeight: 44,
                            borderRadius: 10,
                            border: "1px solid var(--border-color)",
                            textDecoration: "none",
                            fontWeight: 800,
                            background: "var(--surface)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          Leaderboard
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

      {leaveModalPool ? (
        <div
          role="presentation"
          onClick={closeLeaveModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 118,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Remove drafts from pool"
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
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Remove Drafts from {leaveModalPool.name}</h2>
              <p style={{ margin: 0, opacity: 0.8 }}>
                Choose which entered drafts to remove from this pool.
              </p>
            </div>

            {leaveModalLoading ? <p style={{ margin: 0 }}>Loading your pool drafts...</p> : null}

            {!leaveModalLoading && leaveEntries.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={selectAllLeaveEntries}
                    disabled={leaveModalSubmitting}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: leaveModalSubmitting ? "not-allowed" : "pointer",
                      opacity: leaveModalSubmitting ? 0.7 : 1,
                    }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearLeaveSelection}
                    disabled={leaveModalSubmitting}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: leaveModalSubmitting ? "not-allowed" : "pointer",
                      opacity: leaveModalSubmitting ? 0.7 : 1,
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {leaveEntries.map((entry, index) => {
                    const checked = selectedLeaveEntryIds.has(entry.id);
                    return (
                      <label
                        key={entry.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          padding: "10px 12px",
                          background: checked ? "var(--surface-elevated)" : "var(--surface)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLeaveEntrySelection(entry.id)}
                          disabled={leaveModalSubmitting}
                        />
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 900 }}>{leaveEntryLabel(entry, index)}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Entry ID: {entry.id.slice(0, 8)}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {!leaveModalLoading && leaveEntries.length === 0 ? (
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-muted)",
                  padding: "10px 12px",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>No entered drafts found for this pool.</p>
                <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
                  Use the red button below to leave the pool entirely.
                </p>
              </div>
            ) : null}

            {leaveModalMessage ? (
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
                {leaveModalMessage}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeLeaveModal}
                disabled={leaveModalSubmitting}
                style={{
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 800,
                  cursor: leaveModalSubmitting ? "not-allowed" : "pointer",
                  opacity: leaveModalSubmitting ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitLeaveSelection()}
                disabled={
                  leaveModalSubmitting ||
                  leaveModalLoading ||
                  (leaveEntries.length > 0 && selectedLeaveCount === 0)
                }
                style={{
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid #dc2626",
                  background: "rgba(220,38,38,0.12)",
                  color: "#dc2626",
                  fontWeight: 900,
                  cursor:
                    leaveModalSubmitting ||
                    leaveModalLoading ||
                    (leaveEntries.length > 0 && selectedLeaveCount === 0)
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    leaveModalSubmitting ||
                    leaveModalLoading ||
                    (leaveEntries.length > 0 && selectedLeaveCount === 0)
                      ? 0.7
                      : 1,
                }}
              >
                {leaveModalSubmitting
                  ? "Removing..."
                  : leaveEntries.length > 0
                    ? `Remove ${selectedLeaveCount} Draft${selectedLeaveCount === 1 ? "" : "s"}`
                    : "Leave Pool"}
              </button>
            </div>
          </section>
        </div>
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
                {joiningPool ? "Joining..." : "Continue"}
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
                    disabled={draftModalSubmitting}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: draftModalSubmitting ? "not-allowed" : "pointer",
                      opacity: draftModalSubmitting ? 0.7 : 1,
                    }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearDraftSelection}
                    disabled={draftModalSubmitting}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: draftModalSubmitting ? "not-allowed" : "pointer",
                      opacity: draftModalSubmitting ? 0.7 : 1,
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {availableDrafts.map((draft) => {
                    const picks = draftPickMap.get(draft.id);
                    const pickCount = picks?.size ?? 0;
                    const checked = selectedDraftIds.has(draft.id);

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
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDraftSelection(draft.id)}
                          disabled={draftModalSubmitting}
                        />
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 900 }}>{draft.name}</div>
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
                  Open <Link href="/drafts">My Drafts</Link> to create one.
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
                href="/drafts"
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
                  disabled={draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading}
                  style={{
                    padding: "10px 12px",
                    minHeight: 44,
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    fontWeight: 900,
                    cursor:
                      draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading
                        ? "not-allowed"
                        : "pointer",
                    opacity: draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading ? 0.7 : 1,
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
