"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ensurePoolEntry, trySetEntryName } from "@/lib/poolEntry";
import { formatDraftLockTimeET, isDraftLocked, resolveDraftLockTime } from "@/lib/draftLock";
import { trackEvent } from "@/lib/analytics";
import {
  sortDraftTeamsBySeedName,
  summarizeDraft,
  type DraftableTeam,
  DRAFT_BUDGET,
  MAX_14_TO_16_SEEDS,
  MAX_1_OR_2_SEEDS,
  MAX_1_SEEDS,
  MAX_2_SEEDS,
} from "@/lib/draftRules";
import {
  defaultDraftName,
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

function isTeamRow(value: TeamRow | undefined): value is TeamRow {
  return Boolean(value);
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
  const [entryId, setEntryId] = useState<string | null>(null);

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

  const appliedDraft = useMemo(
    () =>
      drafts.find((draft) => {
        const draftPickSet = pickMap.get(draft.id) ?? new Set<string>();
        return sameTeamSet(draftPickSet, poolAppliedTeamIds);
      }) ?? null,
    [drafts, pickMap, poolAppliedTeamIds]
  );

  const selectedIsApplied = useMemo(
    () => sameTeamSet(selectedDraftPicks, poolAppliedTeamIds),
    [selectedDraftPicks, poolAppliedTeamIds]
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
      setEntryId(null);
      setLoading(false);
      return;
    }

    const ensuredEntry = await ensurePoolEntry(supabase, poolId, user.id);
    if (!ensuredEntry.entry || ensuredEntry.error) {
      setLoading(false);
      setMessage(ensuredEntry.error ?? "Failed to create your pool entry.");
      return;
    }
    setEntryId(ensuredEntry.entry.id);

    const { data: poolPickRows, error: poolPicksErr } = await supabase
      .from("entry_picks")
      .select("team_id")
      .eq("entry_id", ensuredEntry.entry.id);

    if (poolPicksErr) {
      setLoading(false);
      setMessage(poolPicksErr.message);
      return;
    }

    const currentPoolPickSet = new Set(((poolPickRows ?? []) as EntryPickRow[]).map((row) => row.team_id));
    setPoolAppliedTeamIds(currentPoolPickSet);

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

    let userDraftRows = (draftRowsQuery.data ?? []) as SavedDraftRow[];

    if (userDraftRows.length === 0) {
      const fallbackName =
        typedPool.name?.trim() && currentPoolPickSet.size > 0
          ? `${typedPool.name} Draft`
          : defaultDraftName(1);

      const created = await supabase
        .from("saved_drafts")
        .insert({
          user_id: user.id,
          name: fallbackName,
        })
        .select("id,name,created_at,updated_at")
        .single();

      if (created.error || !created.data) {
        setLoading(false);
        setMessage(created.error?.message ?? "Failed to create your first saved draft.");
        return;
      }

      const createdId = created.data.id as string;
      if (currentPoolPickSet.size > 0) {
        const copyRows = Array.from(currentPoolPickSet).map((teamId) => ({
          draft_id: createdId,
          team_id: teamId,
        }));
        const { error: copyErr } = await supabase.from("saved_draft_picks").insert(copyRows);
        if (copyErr) {
          setLoading(false);
          setMessage(copyErr.message);
          return;
        }
      }

      userDraftRows = [
        {
          id: createdId,
          user_id: user.id,
          name: created.data.name as string,
          created_at: created.data.created_at as string,
          updated_at: created.data.updated_at as string,
        },
      ];
    }

    const nextDraftRows = toSortedDraftRows(userDraftRows);
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

    const preAppliedDraft = nextDraftRows.find((draft) =>
      sameTeamSet(nextPickMap.get(draft.id) ?? new Set<string>(), currentPoolPickSet)
    );

    setDrafts(nextDraftRows);
    setPickMap(nextPickMap);
    setSelectedDraftId(preAppliedDraft?.id ?? nextDraftRows[0]?.id ?? "");

    setLoading(false);
  }, [poolId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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
    setMessage("Joined pool. Pick a saved draft and apply it.");
  }

  async function applyDraftToPool() {
    if (!isMember) {
      setMessage("Join this pool before applying a draft.");
      return;
    }

    if (!entryId) {
      setMessage("Entry is not ready yet. Refresh and try again.");
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

    setApplying(true);
    setMessage("");

    trackEvent({
      eventName: "pool_draft_apply_attempt",
      poolId,
      entryId,
      metadata: {
        draft_id: selectedDraft.id,
        selected_count: selectedDraftPicks.size,
        total_cost: selectedDraftSummary.totalCost,
      },
    });

    const { error: clearErr } = await supabase
      .from("entry_picks")
      .delete()
      .eq("entry_id", entryId);

    if (clearErr) {
      setApplying(false);
      setMessage(clearErr.message);
      trackEvent({
        eventName: "pool_draft_apply_failure",
        poolId,
        entryId,
        metadata: { draft_id: selectedDraft.id, reason: clearErr.message },
      });
      return;
    }

    const rows = Array.from(selectedDraftPicks).map((teamId) => ({
      entry_id: entryId,
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
          entryId,
          metadata: { draft_id: selectedDraft.id, reason: insertErr.message },
        });
        return;
      }
    }

    const entryNameErr = await trySetEntryName(supabase, entryId, selectedDraft.name);
    if (entryNameErr) {
      setApplying(false);
      setMessage(entryNameErr);
      return;
    }

    setPoolAppliedTeamIds(new Set(selectedDraftPicks));
    setApplying(false);
    setMessage(`Applied "${selectedDraft.name}" to ${pool?.name ?? "this pool"}.`);
    trackEvent({
      eventName: "pool_draft_apply_success",
      poolId,
      entryId,
      metadata: {
        draft_id: selectedDraft.id,
        selected_count: selectedDraftPicks.size,
        total_cost: selectedDraftSummary.totalCost,
      },
    });
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 980, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Pool Draft</h1>
        <p style={{ marginTop: 12 }}>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1000, margin: "48px auto", padding: 16, display: "grid", gap: 16 }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{pool?.name ?? "Pool"}</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.85 }}>
              Apply one of your saved drafts to this pool.
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
              ? "Enter the pool password to join, then you can apply any saved draft."
              : "Join this pool to apply one of your saved drafts."}
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

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void applyDraftToPool()}
              disabled={applying || !selectedDraft || locked || !selectedDraftSummary.isValid}
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                fontWeight: 900,
                cursor:
                  applying || !selectedDraft || locked || !selectedDraftSummary.isValid
                    ? "not-allowed"
                    : "pointer",
                opacity: applying || !selectedDraft || locked || !selectedDraftSummary.isValid ? 0.7 : 1,
              }}
            >
              {applying ? "Applying..." : selectedIsApplied ? "Re-apply draft" : "Apply draft to pool"}
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
              background: selectedDraftSummary.isValid ? "var(--success-bg)" : "var(--danger-bg)",
              fontWeight: 800,
            }}
          >
            {selectedDraft
              ? `Draft "${selectedDraft.name}" - ${selectedDraftPicks.size} teams - ${selectedDraftSummary.totalCost}/${DRAFT_BUDGET}`
              : "Select a draft first."}
            {selectedDraftSummary.isValid ? "" : ` - ${selectedDraftSummary.error ?? "Invalid draft."}`}
          </div>

          <div style={{ display: "grid", gap: 6, fontSize: 13, opacity: 0.8 }}>
            <div>
              Rules: max {MAX_1_SEEDS} one-seeds, max {MAX_2_SEEDS} two-seeds, max {MAX_1_OR_2_SEEDS} combined
              one/two, max {MAX_14_TO_16_SEEDS} seeds 14-16.
            </div>
            <div>
              Currently applied draft:{" "}
              <b>{appliedDraft ? appliedDraft.name : poolAppliedTeamIds.size > 0 ? "Custom / unsaved mix" : "None"}</b>
            </div>
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
