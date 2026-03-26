"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { draftLibraryLockMessage, isDraftLibraryLocked } from "@/lib/draftLock";
import { supabase } from "@/lib/supabaseClient";
import {
  DRAFT_BUDGET,
  MAX_14_TO_16_SEEDS,
  MAX_1_SEEDS,
  MAX_2_SEEDS,
  sortDraftTeamsBySeedName,
  summarizeDraft,
  type DraftableTeam,
} from "@/lib/draftRules";
import { isMissingSavedDraftTablesError } from "@/lib/savedDrafts";
import { toSchoolDisplayName } from "@/lib/teamNames";
import { UiButton, UiCard, UiInput } from "../../components/ui/primitives";

type DraftRow = {
  id: string;
  name: string;
  updated_at: string;
  user_id: string;
};

type TeamRow = DraftableTeam;

type GameRow = {
  round: string;
  team1_id: string | null;
  team2_id: string | null;
};

type DraftPickRow = {
  team_id: string;
};

type MembershipRow = {
  pool_id: string;
};

type PoolNameRow = {
  name: string;
};

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function isTeamRow(value: TeamRow | undefined): value is TeamRow {
  return Boolean(value);
}

export default function DraftDetailPage() {
  const params = useParams<{ draftId: string }>();
  const draftId = params.draftId;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [draftName, setDraftName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedSelected, setSavedSelected] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [bracketPoolId, setBracketPoolId] = useState<string | null>(null);
  const [bracketPoolName, setBracketPoolName] = useState("");
  const [showBracketModal, setShowBracketModal] = useState(false);
  const draftsLocked = isDraftLibraryLocked();
  const lockMessage = draftLibraryLockMessage();

  const teamById = useMemo(() => {
    const map = new Map<string, TeamRow>();
    for (const row of teams) map.set(row.id, row);
    return map;
  }, [teams]);

  const selectedTeams = useMemo(
    () =>
      Array.from(selected)
        .map((teamId) => teamById.get(teamId))
        .filter(isTeamRow)
        .sort(sortDraftTeamsBySeedName),
    [selected, teamById]
  );

  const summary = useMemo(() => summarizeDraft(selected, teamById), [selected, teamById]);
  const hasUnsavedChanges = useMemo(
    () => renameValue.trim() !== draftName.trim() || !sameSet(selected, savedSelected),
    [draftName, renameValue, savedSelected, selected]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage("");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setLoading(false);
        setMessage("Please log in first.");
        return;
      }

      const { data: membershipRows } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1);

      const defaultPoolId = ((membershipRows ?? []) as MembershipRow[])[0]?.pool_id ?? null;
      setBracketPoolId(defaultPoolId);
      setBracketPoolName("");

      if (defaultPoolId) {
        const { data: poolRow } = await supabase
          .from("pools")
          .select("name")
          .eq("id", defaultPoolId)
          .maybeSingle();
        const typedPool = (poolRow as PoolNameRow | null) ?? null;
        setBracketPoolName(typedPool?.name ?? "");
      }

      const { data: draftRow, error: draftErr } = await supabase
        .from("saved_drafts")
        .select("id,name,updated_at,user_id")
        .eq("id", draftId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (draftErr) {
        setLoading(false);
        if (isMissingSavedDraftTablesError(draftErr.message)) {
          setMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
          return;
        }
        setMessage(draftErr.message);
        return;
      }

      if (!draftRow) {
        setLoading(false);
        setMessage("Draft not found.");
        return;
      }

      const typedDraft = draftRow as DraftRow;
      setDraftName(typedDraft.name);
      setRenameValue(typedDraft.name);

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

      let teamQuery = supabase.from("teams").select("id,name,seed,cost");
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

      const { data: pickRows, error: pickErr } = await supabase
        .from("saved_draft_picks")
        .select("team_id")
        .eq("draft_id", draftId);

      if (pickErr) {
        setLoading(false);
        setMessage(pickErr.message);
        return;
      }

      const picked = new Set(((pickRows ?? []) as DraftPickRow[]).map((row) => row.team_id));
      setSelected(new Set(picked));
      setSavedSelected(new Set(picked));

      if (r64TeamIds.length === 0) {
        setMessage("Tournament field is still TBD. Draftable teams will populate once R64 teams are assigned.");
      }

      setLoading(false);
    };

    void load();
  }, [draftId]);

  useEffect(() => {
    if (!showBracketModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showBracketModal]);

  function toggleTeam(teamId: string) {
    if (isDraftLibraryLocked()) {
      setMessage(lockMessage);
      return;
    }

    setMessage("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
        return next;
      }

      next.add(teamId);
      const nextSummary = summarizeDraft(next, teamById);
      if (!nextSummary.isValid) {
        setMessage(nextSummary.error ?? "That selection breaks draft constraints.");
        return prev;
      }
      return next;
    });
  }

  async function saveDraft() {
    if (isDraftLibraryLocked()) {
      setMessage(lockMessage);
      return;
    }

    const nextName = renameValue.trim().slice(0, 80);
    if (!nextName) {
      setMessage("Enter a draft name.");
      return;
    }

    if (!summary.isValid) {
      setMessage(summary.error ?? "Draft is invalid.");
      return;
    }

    setSaving(true);
    setMessage("");

    const touchedAt = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("saved_drafts")
      .update({
        name: nextName,
        updated_at: touchedAt,
      })
      .eq("id", draftId);

    if (updateErr) {
      setSaving(false);
      setMessage(updateErr.message);
      return;
    }

    const { error: deleteErr } = await supabase
      .from("saved_draft_picks")
      .delete()
      .eq("draft_id", draftId);

    if (deleteErr) {
      setSaving(false);
      setMessage(deleteErr.message);
      return;
    }

    const rows = Array.from(selected).map((teamId) => ({
      draft_id: draftId,
      team_id: teamId,
    }));
    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from("saved_draft_picks")
        .insert(rows);
      if (insertErr) {
        setSaving(false);
        setMessage(insertErr.message);
        return;
      }
    }

    setDraftName(nextName);
    setRenameValue(nextName);
    setSavedSelected(new Set(selected));
    setSaving(false);
    setMessage("Draft saved.");
  }

  if (loading) {
    return (
      <main className="page-shell page-shell--stack" style={{ maxWidth: 1050 }}>
        <h1 className="page-title" style={{ fontSize: 28, fontWeight: 900 }}>
          Draft
        </h1>
        <p style={{ marginTop: 12 }}>Loading...</p>
      </main>
    );
  }

  return (
    <main className="page-shell page-shell--stack" style={{ maxWidth: 1100 }}>
      <section
        className="page-surface"
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          background: "var(--surface)",
          padding: 14,
          display: "grid",
          gap: 10,
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
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{draftName || "Draft"}</h1>
            <p style={{ margin: 0, opacity: 0.8 }}>
              {draftsLocked ? lockMessage : "Edit your teams and save this draft."}
            </p>
          </div>
          <UiButton
            type="button"
            onClick={() => setShowBracketModal(true)}
            disabled={!bracketPoolId}
            title={
              bracketPoolId
                ? `Open bracket${bracketPoolName ? ` for ${bracketPoolName}` : ""}`
                : "Join a pool to view a bracket"
            }
          >
            Bracket
          </UiButton>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <UiInput
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            disabled={draftsLocked || saving}
            placeholder="Draft name"
            style={{
              width: "100%",
              maxWidth: 400,
            }}
          />
          <UiButton
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving || draftsLocked || !hasUnsavedChanges || !summary.isValid}
            variant={draftsLocked ? "ghost" : "primary"}
          >
            {saving ? "Saving..." : draftsLocked ? "Draft Locked" : "Save Draft"}
          </UiButton>
        </div>
      </section>

      <section className="draft-editor-layout">
        <UiCard
          as="div"
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          {teams.map((team) => {
            const checked = selected.has(team.id);
            return (
              <label
                key={team.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTeam(team.id)}
                    disabled={draftsLocked || saving}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {toSchoolDisplayName(team.name)}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Seed {team.seed}</div>
                  </div>
                </div>

                <div style={{ fontWeight: 900 }}>{team.cost}</div>
              </label>
            );
          })}
        </UiCard>

        <aside
          className="draft-editor-summary ui-card"
          style={{
            display: "grid",
            gap: 10,
            position: "sticky",
            top: 16,
            height: "fit-content",
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Summary</div>

          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Total cost</span>
              <b>{summary.totalCost}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Remaining</span>
              <b>{summary.remaining}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1-seeds</span>
              <b>
                {summary.count1}/{MAX_1_SEEDS}
              </b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>2-seeds</span>
              <b>
                {summary.count2}/{MAX_2_SEEDS}
              </b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>14-16 seeds</span>
              <b>
                {summary.count141516}/{MAX_14_TO_16_SEEDS}
              </b>
            </div>
          </div>

          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: summary.isValid ? "var(--success-bg)" : "var(--danger-bg)",
              fontWeight: 900,
            }}
          >
            {summary.isValid ? "Draft is valid" : summary.error ?? "Draft is invalid"}
          </div>

          <UiButton
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving || draftsLocked || !hasUnsavedChanges || !summary.isValid}
            variant={draftsLocked ? "ghost" : "primary"}
            size="lg"
            fullWidth
          >
            {saving ? "Saving..." : draftsLocked ? "Draft Locked" : "Save Draft"}
          </UiButton>

          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Rules: budget {DRAFT_BUDGET}, max {MAX_1_SEEDS} one-seeds, max {MAX_2_SEEDS} two-seeds, max{" "}
            {MAX_14_TO_16_SEEDS} seeds 14-16.
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
                    ({team.seed}) {toSchoolDisplayName(team.name)}
                  </span>
                  <b style={{ marginLeft: 8 }}>{team.cost}</b>
                </div>
              ))}
              {selectedTeams.length > 18 ? (
                <div style={{ fontSize: 12, opacity: 0.75 }}>+{selectedTeams.length - 18} more teams</div>
              ) : null}
            </div>
          </div>
        </aside>
      </section>

      {showBracketModal ? (
        <div
          role="presentation"
          onClick={() => setShowBracketModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2300,
            background: "rgba(0,0,0,0.58)",
            padding: 12,
            display: "grid",
            placeItems: "center",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Bracket"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(1880px, 100%)",
              height: "min(92vh, 1150px)",
              border: "1px solid var(--border-color)",
              borderRadius: 14,
              background: "var(--surface)",
              boxShadow: "var(--shadow-lg)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderBottom: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 16, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Bracket{bracketPoolName ? ` - ${bracketPoolName}` : ""}
              </div>
              <button
                type="button"
                onClick={() => setShowBracketModal(false)}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  background: "var(--surface)",
                  fontWeight: 800,
                  cursor: "pointer",
                  padding: "6px 10px",
                }}
              >
                Close
              </button>
            </div>
            {bracketPoolId ? (
              <iframe
                title={bracketPoolName ? `${bracketPoolName} bracket` : "Pool bracket"}
                src={`/pool/${bracketPoolId}/bracket`}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  background: "var(--surface)",
                }}
              />
            ) : (
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  padding: 16,
                  textAlign: "center",
                  fontWeight: 700,
                  opacity: 0.85,
                }}
              >
                Join a pool to view a bracket.
              </div>
            )}
          </section>
        </div>
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
