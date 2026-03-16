"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  DRAFT_BUDGET,
  MAX_14_TO_16_SEEDS,
  MAX_1_OR_2_SEEDS,
  MAX_1_SEEDS,
  MAX_2_SEEDS,
  sortDraftTeamsBySeedName,
  summarizeDraft,
  type DraftableTeam,
} from "@/lib/draftRules";
import {
  clonePickMap,
  defaultDraftName,
  isMissingSavedDraftTablesError,
  sameTeamSet,
  type SavedDraftPickRow,
  type SavedDraftRow,
} from "@/lib/savedDrafts";

type TeamRow = DraftableTeam & {
  logo_url: string | null;
};

type DraftRow = Pick<SavedDraftRow, "id" | "name" | "created_at" | "updated_at">;

type GameRow = {
  round: string;
  team1_id: string | null;
  team2_id: string | null;
};

function isTeamRow(value: TeamRow | undefined): value is TeamRow {
  return Boolean(value);
}

function toInitialPickMap(draftIds: string[], rows: SavedDraftPickRow[]) {
  const map = new Map<string, Set<string>>();
  for (const draftId of draftIds) map.set(draftId, new Set());
  for (const row of rows) {
    const picks = map.get(row.draft_id);
    if (!picks) continue;
    picks.add(row.team_id);
  }
  return map;
}

function sortDraftsByUpdatedAt(rows: DraftRow[]) {
  return [...rows].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

export default function DraftsPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [pickMap, setPickMap] = useState<Map<string, Set<string>>>(new Map());

  const [selectedDraftId, setSelectedDraftId] = useState<string>("");
  const [workingSelected, setWorkingSelected] = useState<Set<string>>(new Set());
  const [renameValue, setRenameValue] = useState("");
  const [newDraftName, setNewDraftName] = useState("");

  const [savingPicks, setSavingPicks] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [renamingDraft, setRenamingDraft] = useState(false);
  const [deletingDraft, setDeletingDraft] = useState(false);
  const [duplicatingDraft, setDuplicatingDraft] = useState(false);

  const teamById = useMemo(() => {
    const map = new Map<string, TeamRow>();
    for (const team of teams) map.set(team.id, team);
    return map;
  }, [teams]);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? null,
    [drafts, selectedDraftId]
  );

  const selectedTeams = useMemo(
    () =>
      Array.from(workingSelected)
        .map((teamId) => teamById.get(teamId))
        .filter(isTeamRow)
        .sort(sortDraftTeamsBySeedName) as TeamRow[],
    [teamById, workingSelected]
  );

  const draftSummary = useMemo(() => summarizeDraft(workingSelected, teamById), [teamById, workingSelected]);
  const savedSelection = useMemo(
    () => pickMap.get(selectedDraftId) ?? new Set<string>(),
    [pickMap, selectedDraftId]
  );
  const hasUnsavedChanges = useMemo(
    () => !sameTeamSet(savedSelection, workingSelected),
    [savedSelection, workingSelected]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage("");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setUserId(null);
        setLoading(false);
        setMessage("Please log in to manage drafts.");
        return;
      }

      setUserId(user.id);

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

      let teamsQuery = supabase.from("teams").select("id,name,seed,cost,logo_url");
      if (r64TeamIds.length > 0) {
        teamsQuery = teamsQuery.in("id", r64TeamIds);
      }

      const { data: teamRows, error: teamErr } = await teamsQuery;
      if (teamErr) {
        setLoading(false);
        setMessage(teamErr.message);
        return;
      }
      setTeams(((teamRows ?? []) as TeamRow[]).sort(sortDraftTeamsBySeedName));

      const draftQuery = await supabase
        .from("saved_drafts")
        .select("id,name,created_at,updated_at,user_id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (draftQuery.error) {
        setLoading(false);
        if (isMissingSavedDraftTablesError(draftQuery.error.message)) {
          setMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
          return;
        }
        setMessage(draftQuery.error.message);
        return;
      }

      let nextDrafts = (draftQuery.data ?? []) as SavedDraftRow[];
      if (nextDrafts.length === 0) {
        const created = await supabase
          .from("saved_drafts")
          .insert({
            user_id: user.id,
            name: defaultDraftName(1),
          })
          .select("id,name,created_at,updated_at")
          .single();

        if (created.error || !created.data) {
          setLoading(false);
          setMessage(created.error?.message ?? "Failed to create your first draft.");
          return;
        }

        nextDrafts = [
          {
            id: created.data.id as string,
            user_id: user.id,
            name: created.data.name as string,
            created_at: created.data.created_at as string,
            updated_at: created.data.updated_at as string,
          },
        ];
      }

      const draftRows = sortDraftsByUpdatedAt(
        nextDrafts.map((row) => ({
          id: row.id,
          name: row.name,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }))
      );
      setDrafts(draftRows);

      const draftIds = draftRows.map((draft) => draft.id);
      const picksQuery = await supabase
        .from("saved_draft_picks")
        .select("draft_id,team_id")
        .in("draft_id", draftIds);

      if (picksQuery.error) {
        setLoading(false);
        setMessage(picksQuery.error.message);
        return;
      }

      const nextPickMap = toInitialPickMap(draftIds, (picksQuery.data ?? []) as SavedDraftPickRow[]);
      setPickMap(nextPickMap);

      const firstDraftId = draftRows[0]?.id ?? "";
      setSelectedDraftId(firstDraftId);
      setRenameValue(draftRows[0]?.name ?? "");
      setWorkingSelected(new Set(nextPickMap.get(firstDraftId) ?? []));

      if (r64TeamIds.length === 0) {
        setMessage("Tournament field is still TBD. Draftable teams will populate once R64 teams are assigned.");
      }

      setLoading(false);
    };

    void load();
  }, []);

  function activateDraft(draftId: string) {
    setSelectedDraftId(draftId);
    const draft = drafts.find((row) => row.id === draftId);
    setRenameValue(draft?.name ?? "");
    setWorkingSelected(new Set(pickMap.get(draftId) ?? []));
    setMessage("");
  }

  function toggleTeam(teamId: string) {
    if (!selectedDraftId) {
      setMessage("Create or select a draft first.");
      return;
    }

    setMessage("");
    setWorkingSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
        return next;
      }

      next.add(teamId);
      const nextSummary = summarizeDraft(next, teamById);
      if (!nextSummary.isValid) {
        setMessage(nextSummary.error ?? "That change breaks draft constraints.");
        return prev;
      }
      return next;
    });
  }

  async function createDraft(copyCurrentSelection: boolean, nameOverride?: string) {
    if (!userId) {
      setMessage("Please log in first.");
      return;
    }

    const draftName = (nameOverride?.trim() || newDraftName.trim() || defaultDraftName(drafts.length + 1)).slice(0, 80);
    setCreatingDraft(true);
    setMessage("");

    const created = await supabase
      .from("saved_drafts")
      .insert({
        user_id: userId,
        name: draftName,
      })
      .select("id,name,created_at,updated_at")
      .single();

    if (created.error || !created.data) {
      setCreatingDraft(false);
      setMessage(created.error?.message ?? "Failed to create draft.");
      return;
    }

    const newDraft: DraftRow = {
      id: created.data.id as string,
      name: created.data.name as string,
      created_at: created.data.created_at as string,
      updated_at: created.data.updated_at as string,
    };

    const copiedSelection = copyCurrentSelection ? new Set(workingSelected) : new Set<string>();

    if (copiedSelection.size > 0) {
      const rows = Array.from(copiedSelection).map((teamId) => ({
        draft_id: newDraft.id,
        team_id: teamId,
      }));
      const { error: picksInsertErr } = await supabase.from("saved_draft_picks").insert(rows);
      if (picksInsertErr) {
        setCreatingDraft(false);
        setMessage(picksInsertErr.message);
        return;
      }
    }

    setDrafts((prev) => sortDraftsByUpdatedAt([newDraft, ...prev]));
    setPickMap((prev) => {
      const next = clonePickMap(prev);
      next.set(newDraft.id, copiedSelection);
      return next;
    });
    setSelectedDraftId(newDraft.id);
    setRenameValue(newDraft.name);
    setWorkingSelected(copiedSelection);
    setNewDraftName("");
    setMessage(copyCurrentSelection ? "Draft duplicated." : "Draft created.");
    setCreatingDraft(false);
  }

  async function renameDraft() {
    if (!selectedDraftId || !selectedDraft) {
      setMessage("Select a draft first.");
      return;
    }

    const nextName = renameValue.trim().slice(0, 80);
    if (!nextName) {
      setMessage("Enter a draft name.");
      return;
    }

    setRenamingDraft(true);
    setMessage("");

    const { error } = await supabase
      .from("saved_drafts")
      .update({ name: nextName })
      .eq("id", selectedDraftId);

    if (error) {
      setRenamingDraft(false);
      setMessage(error.message);
      return;
    }

    setDrafts((prev) =>
      sortDraftsByUpdatedAt(
        prev.map((draft) =>
          draft.id === selectedDraftId
            ? {
                ...draft,
                name: nextName,
                updated_at: new Date().toISOString(),
              }
            : draft
        )
      )
    );
    setMessage("Draft renamed.");
    setRenamingDraft(false);
  }

  async function saveDraftPicks() {
    if (!selectedDraftId) {
      setMessage("Select a draft first.");
      return;
    }

    if (!draftSummary.isValid) {
      setMessage(draftSummary.error ?? "Draft is invalid.");
      return;
    }

    setSavingPicks(true);
    setMessage("");

    const { error: deleteErr } = await supabase
      .from("saved_draft_picks")
      .delete()
      .eq("draft_id", selectedDraftId);

    if (deleteErr) {
      setSavingPicks(false);
      setMessage(deleteErr.message);
      return;
    }

    const rows = Array.from(workingSelected).map((teamId) => ({
      draft_id: selectedDraftId,
      team_id: teamId,
    }));
    if (rows.length > 0) {
      const { error: insertErr } = await supabase.from("saved_draft_picks").insert(rows);
      if (insertErr) {
        setSavingPicks(false);
        setMessage(insertErr.message);
        return;
      }
    }

    const touchedAt = new Date().toISOString();
    const { error: touchErr } = await supabase
      .from("saved_drafts")
      .update({ updated_at: touchedAt })
      .eq("id", selectedDraftId);

    if (touchErr) {
      setSavingPicks(false);
      setMessage(touchErr.message);
      return;
    }

    setPickMap((prev) => {
      const next = clonePickMap(prev);
      next.set(selectedDraftId, new Set(workingSelected));
      return next;
    });
    setDrafts((prev) =>
      sortDraftsByUpdatedAt(
        prev.map((draft) => (draft.id === selectedDraftId ? { ...draft, updated_at: touchedAt } : draft))
      )
    );
    setMessage("Draft saved.");
    setSavingPicks(false);
  }

  async function deleteDraft() {
    if (!selectedDraftId || !selectedDraft) {
      setMessage("Select a draft first.");
      return;
    }

    const confirmed = window.confirm(`Delete "${selectedDraft.name}"?`);
    if (!confirmed) return;

    setDeletingDraft(true);
    setMessage("");

    const { error } = await supabase.from("saved_drafts").delete().eq("id", selectedDraftId);
    if (error) {
      setDeletingDraft(false);
      setMessage(error.message);
      return;
    }

    const remainingDrafts = drafts.filter((draft) => draft.id !== selectedDraftId);
    setDrafts(remainingDrafts);

    setPickMap((prev) => {
      const next = clonePickMap(prev);
      next.delete(selectedDraftId);
      return next;
    });

    const nextActiveId = remainingDrafts[0]?.id ?? "";
    setSelectedDraftId(nextActiveId);
    setRenameValue(remainingDrafts[0]?.name ?? "");
    setWorkingSelected(new Set(pickMap.get(nextActiveId) ?? []));
    setDeletingDraft(false);
    setMessage("Draft deleted.");
  }

  async function duplicateCurrentDraft() {
    if (!selectedDraft) {
      setMessage("Select a draft first.");
      return;
    }

    setDuplicatingDraft(true);
    await createDraft(true, `${selectedDraft.name} Copy`);
    setDuplicatingDraft(false);
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 1040, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Drafts</h1>
        <p style={{ marginTop: 12 }}>Loading your drafts...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1100, margin: "48px auto", padding: 16, display: "grid", gap: 16 }}>
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
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>My Drafts</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.85 }}>
              Build and save multiple drafts, then apply any one to any pool.
            </p>
          </div>
          <Link
            href="/pools"
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              textDecoration: "none",
              fontWeight: 800,
              background: "var(--surface)",
              height: "fit-content",
            }}
          >
            Open Pools
          </Link>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="draft-select" style={{ fontWeight: 800, fontSize: 13 }}>
            Active draft
          </label>
          <select
            id="draft-select"
            value={selectedDraftId}
            onChange={(event) => activateDraft(event.target.value)}
            style={{
              width: "100%",
              maxWidth: 420,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface-muted)",
            }}
          >
            {drafts.length === 0 ? <option value="">No drafts yet</option> : null}
            {drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={newDraftName}
            onChange={(event) => setNewDraftName(event.target.value)}
            placeholder={`New draft name (default: ${defaultDraftName(drafts.length + 1)})`}
            style={{
              flex: "1 1 320px",
              minWidth: 220,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface-muted)",
            }}
          />
          <button
            type="button"
            onClick={() => void createDraft(false)}
            disabled={creatingDraft}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              fontWeight: 800,
              cursor: creatingDraft ? "not-allowed" : "pointer",
              opacity: creatingDraft ? 0.7 : 1,
            }}
          >
            {creatingDraft ? "Creating..." : "New draft"}
          </button>
          <button
            type="button"
            onClick={() => void duplicateCurrentDraft()}
            disabled={duplicatingDraft || !selectedDraft}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              fontWeight: 800,
              cursor: duplicatingDraft || !selectedDraft ? "not-allowed" : "pointer",
              opacity: duplicatingDraft || !selectedDraft ? 0.7 : 1,
            }}
          >
            {duplicatingDraft ? "Duplicating..." : "Duplicate"}
          </button>
          <button
            type="button"
            onClick={() => void deleteDraft()}
            disabled={deletingDraft || !selectedDraft}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--danger-bg)",
              fontWeight: 800,
              cursor: deletingDraft || !selectedDraft ? "not-allowed" : "pointer",
              opacity: deletingDraft || !selectedDraft ? 0.7 : 1,
            }}
          >
            {deletingDraft ? "Deleting..." : "Delete"}
          </button>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Draft editor</div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Draft name"
              disabled={!selectedDraftId}
              style={{
                flex: "1 1 280px",
                minWidth: 200,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            />
            <button
              type="button"
              onClick={() => void renameDraft()}
              disabled={!selectedDraftId || renamingDraft}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                fontWeight: 800,
                cursor: !selectedDraftId || renamingDraft ? "not-allowed" : "pointer",
                opacity: !selectedDraftId || renamingDraft ? 0.7 : 1,
              }}
            >
              {renamingDraft ? "Saving..." : "Rename"}
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {teams.map((team) => {
              const checked = workingSelected.has(team.id);
              return (
                <label
                  key={team.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--border-color)",
                    borderRadius: 10,
                    cursor: selectedDraftId ? "pointer" : "not-allowed",
                    opacity: selectedDraftId ? 1 : 0.65,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!selectedDraftId}
                      onChange={() => toggleTeam(team.id)}
                    />
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
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>{team.name}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>Seed {team.seed}</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>{team.cost}</div>
                </label>
              );
            })}
          </div>
        </div>

        <aside
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Summary</div>

          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Total cost</span>
              <b>{draftSummary.totalCost}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Remaining</span>
              <b>{draftSummary.remaining}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1-seeds</span>
              <b>
                {draftSummary.count1}/{MAX_1_SEEDS}
              </b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>2-seeds</span>
              <b>
                {draftSummary.count2}/{MAX_2_SEEDS}
              </b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1+2 combined</span>
              <b>
                {draftSummary.count12}/{MAX_1_OR_2_SEEDS}
              </b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>14-16 seeds</span>
              <b>
                {draftSummary.count141516}/{MAX_14_TO_16_SEEDS}
              </b>
            </div>
          </div>

          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: draftSummary.isValid ? "var(--success-bg)" : "var(--danger-bg)",
              fontWeight: 900,
            }}
          >
            {draftSummary.isValid ? "Draft is valid" : draftSummary.error ?? "Draft is invalid"}
          </div>

          <button
            type="button"
            onClick={() => void saveDraftPicks()}
            disabled={savingPicks || !selectedDraftId || !draftSummary.isValid || !hasUnsavedChanges}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              fontWeight: 900,
              cursor:
                savingPicks || !selectedDraftId || !draftSummary.isValid || !hasUnsavedChanges
                  ? "not-allowed"
                  : "pointer",
              opacity: savingPicks || !selectedDraftId || !draftSummary.isValid || !hasUnsavedChanges ? 0.65 : 1,
            }}
          >
            {savingPicks ? "Saving..." : "Save draft picks"}
          </button>

          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Rules: budget {DRAFT_BUDGET}, max {MAX_1_SEEDS} one-seeds, max {MAX_2_SEEDS} two-seeds, max{" "}
            {MAX_1_OR_2_SEEDS} combined one/two, max {MAX_14_TO_16_SEEDS} seeds 14-16.
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Selected teams ({selectedTeams.length})</div>
            <div style={{ display: "grid", gap: 4 }}>
              {selectedTeams.slice(0, 18).map((team) => (
                <div
                  key={team.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "var(--surface-muted)",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    ({team.seed}) {team.name}
                  </span>
                  <b style={{ marginLeft: 8 }}>{team.cost}</b>
                </div>
              ))}
              {selectedTeams.length > 18 ? (
                <div style={{ fontSize: 12, opacity: 0.75 }}>+{selectedTeams.length - 18} more teams</div>
              ) : null}
              {selectedTeams.length === 0 ? <div style={{ fontSize: 13, opacity: 0.75 }}>No teams selected yet.</div> : null}
            </div>
          </div>
        </aside>
      </section>

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
