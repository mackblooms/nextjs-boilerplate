"use client";

import Link from "next/link";
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
import WorldCupTeamLabel from "../../components/WorldCupTeamLabel";
import { UiButton, UiCard, UiFormField, UiInput, UiStatus, UiTooltip } from "../../components/ui/primitives";

type DraftRow = {
  id: string;
  name: string;
  updated_at: string;
  user_id: string;
  competition_slug?: string;
};

type TeamRow = DraftableTeam & {
  logo_url?: string | null;
};

type GameRow = {
  round: string;
  team1_id: string | null;
  team2_id: string | null;
};

type DraftPickRow = {
  team_id: string;
};

type LinkedPoolEntry = {
  poolId: string;
  poolName: string | null;
  lockTime: string | null;
  competitionSlug: CompetitionSlug;
  entryIds: string[];
};

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function competitionPathWithParams(
  path: string,
  competitionSlug: CompetitionSlug,
  params: Record<string, string>,
) {
  const search = new URLSearchParams(params);
  if (competitionSlug !== "march-madness") search.set("competition", competitionSlug);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
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
  const [returnPoolId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("returnPoolId")?.trim() ?? "";
  });

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
  const [linkedPools, setLinkedPools] = useState<LinkedPoolEntry[]>([]);
  const [linkedPoolsLoading, setLinkedPoolsLoading] = useState(false);
  const [removingPoolId, setRemovingPoolId] = useState<string | null>(null);
  const [inspectedTeam, setInspectedTeam] = useState<TeamRow | null>(null);
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

  async function loadLinkedPools(showLoading = false) {
    if (showLoading) setLinkedPoolsLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setLinkedPools([]);
      setLinkedPoolsLoading(false);
      return;
    }

    const res = await fetch("/api/drafts/linked-pools", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ draftId }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      entries?: LinkedPoolEntry[];
      error?: string;
    };

    if (!res.ok) {
      setLinkedPools([]);
      setLinkedPoolsLoading(false);
      setMessage(body.error ?? "Failed to load pool entries for this draft.");
      return;
    }

    setLinkedPools(body.entries ?? []);
    setLinkedPoolsLoading(false);
  }

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
      void loadLinkedPools(true);
    };

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (returnPoolId) {
      router.push(
        competitionPathWithParams(`/pool/${returnPoolId}/draft`, competitionSlug, { draftId }),
      );
      return;
    }

    setMessage(
      syncJson.syncedEntries && syncJson.syncedEntries > 0
        ? `Draft saved and updated ${syncJson.syncedEntries} pool ${syncJson.syncedEntries === 1 ? "entry" : "entries"}.`
        : "Draft saved."
    );
  }

  async function deleteDraft() {
    const ok = window.confirm(`Delete "${draftName || "this draft"}" permanently? This removes it from every pool too.`);
    if (!ok) return;

    setDeleting(true);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setDeleting(false);
      setMessage("Please log in first.");
      return;
    }

    const res = await fetch("/api/drafts/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ draftId }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setDeleting(false);
      setMessage(body.error ?? "Failed to delete draft.");
      return;
    }

    router.push(competitionPath("/drafts", competitionSlug));
  }

  async function removeDraftFromPool(entry: LinkedPoolEntry) {
    const poolName = entry.poolName ?? "this pool";
    const ok = window.confirm(`Remove "${draftName || "this draft"}" from ${poolName}? The saved draft will stay in your drafts.`);
    if (!ok) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage("Please log in first.");
      return;
    }

    setRemovingPoolId(entry.poolId);
    setMessage("");

    const res = await fetch("/api/pools/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        poolId: entry.poolId,
        entryIds: entry.entryIds,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setRemovingPoolId(null);
      setMessage(body.error ?? "Failed to remove draft from pool.");
      return;
    }

    setLinkedPools((prev) => prev.filter((row) => row.poolId !== entry.poolId));
    setRemovingPoolId(null);
    setMessage(`Removed "${draftName || "draft"}" from ${poolName}.`);
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
      <DraftScoringNotice competitionSlug={competitionSlug} />
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
          <UiTooltip content={deleting ? "deleting draft" : "delete this draft"}>
            <UiButton
              type="button"
              onClick={() => void deleteDraft()}
              disabled={deleting}
              variant="danger"
              aria-label={deleting ? `Deleting ${draftName}` : `Delete ${draftName}`}
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
          </UiTooltip>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <UiFormField
            label="draft name"
            htmlFor="draft-name"
            helperText="rename the saved draft before entering it in pools."
            style={{ width: "min(400px, 100%)" }}
          >
            <UiInput
              id="draft-name"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              disabled={draftsLocked || saving}
              placeholder="draft name"
            />
          </UiFormField>
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Pool entries</h2>
            <p style={{ margin: "4px 0 0", opacity: 0.78, fontSize: 13 }}>
              {linkedPoolsLoading
                ? "Loading pool entries..."
                : linkedPools.length > 0
                  ? `${linkedPools.length} pool${linkedPools.length === 1 ? "" : "s"} using this draft`
                  : "This draft is not entered in any pools."}
            </p>
            <p className="ui-field-helper" style={{ marginTop: 4 }}>
              linked entries update when you save this draft, so pool standings stay attached to your latest picks.
            </p>
          </div>
          <UiTooltip content="refresh linked pool entries">
            <UiButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void loadLinkedPools(true)}
              disabled={linkedPoolsLoading}
            >
              {linkedPoolsLoading ? "Refreshing..." : "Refresh"}
            </UiButton>
          </UiTooltip>
        </div>

        {linkedPools.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            {linkedPools.map((entry) => (
              <div
                key={entry.poolId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-muted)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                  <Link
                    href={competitionPath(`/pool/${entry.poolId}`, entry.competitionSlug)}
                    style={{
                      color: "inherit",
                      fontWeight: 900,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.poolName ?? "Pool"}
                  </Link>
                  <span style={{ fontSize: 12, opacity: 0.72 }}>
                    {entry.entryIds.length} entr{entry.entryIds.length === 1 ? "y" : "ies"}
                  </span>
                </div>
                <UiButton
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => void removeDraftFromPool(entry)}
                  disabled={removingPoolId === entry.poolId}
                >
                  {removingPoolId === entry.poolId ? "Removing..." : "Remove from Pool"}
                </UiButton>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="draft-editor-layout">
        <UiCard
          as="div"
          style={{
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "grid", gap: 3 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>available teams</h2>
            <p className="ui-field-helper">
              check teams to add them to your draft; the summary tells you when your picks are valid.
            </p>
          </div>
          {teams.map((team) => {
            const checked = selected.has(team.id);
            return (
              <article
                key={team.id}
                className="draft-team-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTeam(team.id)}
                    disabled={draftsLocked || saving}
                  />
                  <div style={{ minWidth: 0 }}>
                    {competitionSlug === "world-cup" ? (
                      <WorldCupTeamLabel
                        name={team.name}
                        logoUrl={team.logo_url}
                        nameStyle={{ fontWeight: 800 }}
                      />
                    ) : (
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {toSchoolDisplayName(team.name)}
                      </div>
                    )}
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {competitionSlug === "world-cup"
                        ? `${getWorldCupTierForCost(team.cost)?.name ?? "world cup"} tier`
                        : `seed ${team.seed}`}
                    </div>
                  </div>
                </label>

                <div className="draft-team-actions">
                  <UiTooltip content="view team scoring details">
                    <button
                      type="button"
                      onClick={() => setInspectedTeam(team)}
                      className="draft-team-detail-button"
                    >
                      Details
                    </button>
                  </UiTooltip>
                  <div style={{ fontWeight: 900 }}>{team.cost}</div>
                </div>
              </article>
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
          <p className="ui-field-helper">
            use this panel as your guardrail: stay under budget and satisfy the competition limits before saving.
          </p>

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

          <UiStatus tone={summary.isValid ? "success" : "error"}>
            {summary.isValid ? "draft is valid" : summary.error ?? "draft is invalid"}
          </UiStatus>

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
            <p className="ui-field-helper">
              these are the teams that will be entered when this draft is attached to a pool.
            </p>
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
                  {competitionSlug === "world-cup" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                      <span style={{ flexShrink: 0 }}>({getWorldCupTierForCost(team.cost)?.name ?? "World Cup"})</span>
                      <WorldCupTeamLabel name={team.name} logoUrl={team.logo_url} />
                    </span>
                  ) : (
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      ({team.seed}) {toSchoolDisplayName(team.name)}
                    </span>
                  )}
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

      {inspectedTeam ? (
        <div
          role="presentation"
          onClick={() => setInspectedTeam(null)}
          className="app-sheet-backdrop"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${toSchoolDisplayName(inspectedTeam.name)} details`}
            onClick={(event) => event.stopPropagation()}
            className="app-bottom-sheet"
          >
            <div className="app-sheet-grabber" aria-hidden="true" />
            <div className="app-sheet-header">
              <div>
                <span className="match-kicker">Team detail</span>
                <h2>
                  {competitionSlug === "world-cup" ? (
                    <WorldCupTeamLabel name={inspectedTeam.name} logoUrl={inspectedTeam.logo_url} />
                  ) : (
                    toSchoolDisplayName(inspectedTeam.name)
                  )}
                </h2>
              </div>
              <button type="button" onClick={() => setInspectedTeam(null)} className="native-only-icon-action">
                x
              </button>
            </div>
            <div className="team-detail-grid">
              <div>
                <span>Cost</span>
                <strong>{inspectedTeam.cost}</strong>
              </div>
              <div>
                <span>{competitionSlug === "world-cup" ? "Tier" : "Seed"}</span>
                <strong>
                  {competitionSlug === "world-cup"
                    ? getWorldCupTierForCost(inspectedTeam.cost)?.name ?? "World Cup"
                    : inspectedTeam.seed}
                </strong>
              </div>
              <div>
                <span>Selected</span>
                <strong>{selected.has(inspectedTeam.id) ? "Yes" : "No"}</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleTeam(inspectedTeam.id)}
              disabled={draftsLocked || saving}
              className="ui-btn ui-btn--md ui-btn--primary"
            >
              {selected.has(inspectedTeam.id) ? "Remove from draft" : "Add to draft"}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
