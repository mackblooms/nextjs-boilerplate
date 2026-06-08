"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { draftLibraryLockMessage, isDraftLibraryLocked } from "@/lib/draftLock";
import { supabase } from "@/lib/supabaseClient";
import {
  DRAFT_BUDGET,
  MAX_14_TO_16_SEEDS,
  MAX_1_SEEDS,
  MAX_2_SEEDS,
  WORLD_CUP_MAX_ELITE_TEAMS,
  sortDraftTeamsForCompetition,
  summarizeDraft,
  type DraftableTeam,
} from "@/lib/draftRules";
import { isMissingSavedDraftTablesError } from "@/lib/savedDrafts";
import { competitionPath, normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";
import { canUseLegacyMarchMadnessFallback } from "@/lib/competitionData";
import { toSchoolDisplayName } from "@/lib/teamNames";
import { getWorldCupTierForCost, withWorldCupDraftCost } from "@/lib/worldCupRules";
import DraftScoringNotice from "../../components/DraftScoringNotice";
import { UiButton, UiCard, UiInput } from "../../components/ui/primitives";

type DraftRow = {
  id: string;
  name: string;
  updated_at: string;
  user_id: string;
  competition_slug?: string;
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

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={17}
      height={17}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function DraftDetailPage() {
  const params = useParams<{ draftId: string }>();
  const router = useRouter();
  const draftId = params.draftId;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [draftName, setDraftName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedSelected, setSavedSelected] = useState<Set<string>>(new Set());
  const [competitionSlug, setCompetitionSlug] = useState<CompetitionSlug>("world-cup");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const draftsLocked = isDraftLibraryLocked(competitionSlug);
  const lockMessage = draftLibraryLockMessage(competitionSlug);

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
        .sort(sortDraftTeamsForCompetition(competitionSlug)),
    [competitionSlug, selected, teamById]
  );

  const summary = useMemo(
    () => summarizeDraft(selected, teamById, competitionSlug),
    [competitionSlug, selected, teamById],
  );
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

      let { data: draftRow, error: draftErr } = await supabase
        .from("saved_drafts")
        .select("id,name,updated_at,user_id,competition_slug")
        .eq("id", draftId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (canUseLegacyMarchMadnessFallback("march-madness", draftErr?.message)) {
        const fallback = await supabase
          .from("saved_drafts")
          .select("id,name,updated_at,user_id")
          .eq("id", draftId)
          .eq("user_id", user.id)
          .maybeSingle();
        draftRow = fallback.data ? { ...fallback.data, competition_slug: null } : null;
        draftErr = fallback.error;
      }

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
      const nextCompetitionSlug = normalizeCompetitionSlug(typedDraft.competition_slug);
      setCompetitionSlug(nextCompetitionSlug);
      setDraftName(typedDraft.name);
      setRenameValue(typedDraft.name);

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
        .select("id,name,seed,cost")
        .eq("competition_slug", nextCompetitionSlug);
      if (r64TeamIds.length > 0) {
        teamQuery = teamQuery.in("id", r64TeamIds);
      }

      let { data: teamRows, error: teamErr } = await teamQuery;
      if (canUseLegacyMarchMadnessFallback(nextCompetitionSlug, teamErr?.message)) {
        const fallback = r64TeamIds.length > 0
          ? await supabase.from("teams").select("id,name,seed,cost").in("id", r64TeamIds)
          : await supabase.from("teams").select("id,name,seed,cost");
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

      if (nextCompetitionSlug === "march-madness" && r64TeamIds.length === 0) {
        setMessage("Tournament field is still TBD. Draftable teams will populate once R64 teams are assigned.");
      }

      setLoading(false);
    };

    void load();
  }, [draftId]);

  function toggleTeam(teamId: string) {
    if (isDraftLibraryLocked(competitionSlug)) {
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
      const nextSummary = summarizeDraft(next, teamById, competitionSlug);
      if (!nextSummary.isValid) {
        setMessage(nextSummary.error ?? "That selection breaks draft constraints.");
        return prev;
      }
      return next;
    });
  }

  async function saveDraft() {
    if (isDraftLibraryLocked(competitionSlug)) {
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

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (sessionErr || !accessToken) {
      setSaving(false);
      setMessage(
        sessionErr
          ? `Draft saved, but linked pool entries were not updated: ${sessionErr.message}`
          : "Draft saved, but linked pool entries were not updated: missing auth token."
      );
      return;
    }

    const syncRes = await fetch("/api/drafts/sync-linked-entries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ draftId }),
    });
    const syncJson = (await syncRes.json().catch(() => ({}))) as {
      syncedEntries?: number;
      error?: string;
    };
    if (!syncRes.ok) {
      setSaving(false);
      setMessage(`Draft saved, but linked pool entries were not updated: ${syncJson.error ?? "Unknown error"}`);
      return;
    }

    setDraftName(nextName);
    setRenameValue(nextName);
    setSavedSelected(new Set(selected));
    setSaving(false);
    setMessage(
      syncJson.syncedEntries && syncJson.syncedEntries > 0
        ? `Draft saved and updated ${syncJson.syncedEntries} pool ${syncJson.syncedEntries === 1 ? "entry" : "entries"}.`
        : "Draft saved."
    );
  }

  async function deleteDraft() {
    const ok = window.confirm(`Delete "${draftName || "this draft"}"?`);
    if (!ok) return;

    setDeleting(true);
    setMessage("");

    const { error } = await supabase
      .from("saved_drafts")
      .delete()
      .eq("id", draftId);

    if (error) {
      setDeleting(false);
      setMessage(error.message);
      return;
    }

    router.push(competitionPath("/drafts", competitionSlug));
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
      <DraftScoringNotice />
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
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>{draftName || "draft"}</h1>
            <p style={{ margin: 0, opacity: 0.8 }}>
              {draftsLocked ? lockMessage : "Edit your teams and save this draft."}
            </p>
          </div>
          <UiButton
            type="button"
            onClick={() => void deleteDraft()}
            disabled={deleting}
            variant="danger"
            aria-label={deleting ? `Deleting ${draftName}` : `Delete ${draftName}`}
            title={deleting ? "Deleting..." : `Delete ${draftName || "draft"}`}
            style={{
              width: 42,
              height: 42,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <TrashIcon />
          </UiButton>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <UiInput
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            disabled={draftsLocked || saving}
            placeholder="draft name"
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
            {saving ? "saving..." : draftsLocked ? "draft locked" : "save draft"}
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
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {competitionSlug === "world-cup"
                        ? `${getWorldCupTierForCost(team.cost)?.name ?? "world cup"} tier`
                        : `seed ${team.seed}`}
                    </div>
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
          <div style={{ fontWeight: 900, fontSize: 18 }}>summary</div>

          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>total cost</span>
              <b>{summary.totalCost}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>remaining</span>
              <b>{summary.remaining}</b>
            </div>
            {competitionSlug === "march-madness" ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>1-seeds</span>
                  <b>{summary.count1}/{MAX_1_SEEDS}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>2-seeds</span>
                  <b>{summary.count2}/{MAX_2_SEEDS}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>14-16 seeds</span>
                  <b>{summary.count141516}/{MAX_14_TO_16_SEEDS}</b>
                </div>
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>gold+ teams</span>
                <b>{summary.countWorldCupElite}/{WORLD_CUP_MAX_ELITE_TEAMS}</b>
              </div>
            )}
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
            {summary.isValid ? "draft is valid" : summary.error ?? "draft is invalid"}
          </div>

          <UiButton
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving || draftsLocked || !hasUnsavedChanges || !summary.isValid}
            variant={draftsLocked ? "ghost" : "primary"}
            size="lg"
            fullWidth
          >
            {saving ? "saving..." : draftsLocked ? "draft locked" : "save draft"}
          </UiButton>

          <div style={{ fontSize: 13, opacity: 0.75 }}>
            {competitionSlug === "world-cup"
              ? `rules: draft any number of national teams within the ${DRAFT_BUDGET}-point budget; max ${WORLD_CUP_MAX_ELITE_TEAMS} gold-or-higher teams.`
              : `rules: budget ${DRAFT_BUDGET}, max ${MAX_1_SEEDS} one-seeds, max ${MAX_2_SEEDS} two-seeds, max ${MAX_14_TO_16_SEEDS} seeds 14-16.`}
          </div>

          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>selected teams ({selectedTeams.length})</div>
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
                    {competitionSlug === "world-cup"
                      ? `(${getWorldCupTierForCost(team.cost)?.name ?? "World Cup"}) ${toSchoolDisplayName(team.name)}`
                      : `(${team.seed}) ${toSchoolDisplayName(team.name)}`}
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
