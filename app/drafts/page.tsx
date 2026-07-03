"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { draftLibraryLockMessage, isDraftLibraryLocked } from "@/lib/draftLock";
import { supabase } from "@/lib/supabaseClient";
import { defaultDraftName, isMissingSavedDraftTablesError, type SavedDraftRow } from "@/lib/savedDrafts";
import { UiButton, UiCard, UiInput, UiLinkButton } from "../components/ui/primitives";
import { competitionPath, getCompetition, normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";
import { canUseLegacyMarchMadnessFallback, isMissingCompetitionSlugColumn } from "@/lib/competitionData";

type DraftRow = Pick<SavedDraftRow, "id" | "name" | "created_at" | "updated_at">;
type DraftPickRow = { draft_id: string };

function formatUpdatedAt(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function sortDrafts(rows: DraftRow[]) {
  return [...rows].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
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

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
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

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function DraftsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const competitionSlug = normalizeCompetitionSlug(searchParams.get("competition"));
  const competition = getCompetition(competitionSlug);
  const returnPoolId = searchParams.get("returnPoolId")?.trim() ?? "";
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [pickCountByDraft, setPickCountByDraft] = useState<Record<string, number>>({});

  const [newDraftName, setNewDraftName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const draftsLocked = isDraftLibraryLocked(competitionSlug);
  const lockMessage = draftLibraryLockMessage(competitionSlug);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage("");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setUserId(null);
        setLoading(false);
        setMessage("Please log in to view your drafts.");
        return;
      }

      setUserId(user.id);

      let { data: draftRows, error: draftErr } = await supabase
        .from("saved_drafts")
        .select("id,name,created_at,updated_at,user_id,competition_slug")
        .eq("user_id", user.id)
        .eq("competition_slug", competitionSlug)
        .order("updated_at", { ascending: false });

      if (canUseLegacyMarchMadnessFallback(competitionSlug, draftErr?.message)) {
        const fallback = await supabase
          .from("saved_drafts")
          .select("id,name,created_at,updated_at,user_id")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });
        draftRows = (fallback.data ?? []).map((draft) => ({
          ...draft,
          competition_slug: null,
        }));
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

      const nextDrafts = sortDrafts(
        ((draftRows ?? []) as SavedDraftRow[]).map((row) => ({
          id: row.id,
          name: row.name,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }))
      );
      setDrafts(nextDrafts);

      if (nextDrafts.length > 0) {
        const { data: pickRows, error: pickErr } = await supabase
          .from("saved_draft_picks")
          .select("draft_id")
          .in("draft_id", nextDrafts.map((row) => row.id));

        if (pickErr) {
          setLoading(false);
          setMessage(pickErr.message);
          return;
        }

        const counts: Record<string, number> = {};
        for (const row of (pickRows ?? []) as DraftPickRow[]) {
          counts[row.draft_id] = (counts[row.draft_id] ?? 0) + 1;
        }
        setPickCountByDraft(counts);
      } else {
        setPickCountByDraft({});
      }

      setLoading(false);
    };

    void load();
  }, [competitionSlug]);

  async function createDraft() {
    if (isDraftLibraryLocked(competitionSlug)) {
      setMessage(lockMessage);
      return;
    }

    if (!userId) {
      setMessage("Please log in first.");
      return;
    }

    const name = (newDraftName.trim() || defaultDraftName(drafts.length + 1)).slice(0, 80);
    setCreating(true);
    setMessage("");

    const { data: created, error } = await supabase
      .from("saved_drafts")
      .insert({
        user_id: userId,
        name,
        competition_slug: competitionSlug,
      })
      .select("id,name,created_at,updated_at")
      .single();

    if (error || !created) {
      setCreating(false);
      setMessage(
        isMissingCompetitionSlugColumn(error?.message)
          ? "World Cup setup is not installed in the database yet. Run db/migrations/20260531_world_cup_competitions.sql in the Supabase SQL Editor, then try again."
          : error?.message ?? "Failed to create draft.",
      );
      return;
    }

    const nextDraft: DraftRow = {
      id: created.id as string,
      name: created.name as string,
      created_at: created.created_at as string,
      updated_at: created.updated_at as string,
    };

    setDrafts((prev) => sortDrafts([nextDraft, ...prev]));
    setPickCountByDraft((prev) => ({ ...prev, [nextDraft.id]: 0 }));
    setNewDraftName("");
    setCreating(false);

    if (returnPoolId) {
      router.push(
        competitionPathWithParams(`/drafts/${nextDraft.id}`, competitionSlug, { returnPoolId }),
      );
      return;
    }

    setMessage(`Created "${nextDraft.name}".`);
  }

  async function deleteDraft(draftId: string, draftName: string) {
    const ok = window.confirm(`Delete "${draftName}"?`);
    if (!ok) return;

    setDeletingDraftId(draftId);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setDeletingDraftId(null);
      setMessage("Please log in first.");
      return;
    }

    const res = await fetch("/api/drafts/delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ draftId }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setDeletingDraftId(null);
      setMessage(body.error ?? "Failed to delete draft.");
      return;
    }

    setDrafts((prev) => prev.filter((row) => row.id !== draftId));
    setPickCountByDraft((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
    setDeletingDraftId(null);
    setMessage(`Deleted "${draftName}".`);
  }

  const hasDrafts = useMemo(() => drafts.length > 0, [drafts]);

  if (loading) {
    return (
      <main className="page-shell page-shell--stack" style={{ maxWidth: 960 }}>
        <h1 className="page-title" style={{ fontSize: 30, fontWeight: 900 }}>
          {competition.shortName} Drafts
        </h1>
        <p className="ui-loading-state">
          <strong>Loading drafts...</strong>
        </p>
      </main>
    );
  }

  return (
    <main className="page-shell page-shell--stack drafts-shell" style={{ maxWidth: 960 }}>
      <section
        className="page-surface drafts-command-bar"
        style={{
          border: "1px solid var(--border-color)",
          background: "var(--surface)",
        }}
      >
        <div className="drafts-command-head">
          <div className="drafts-title-stack">
            <span className="match-kicker">{competition.sport}</span>
            <h1>{competition.shortName} Drafts</h1>
            <span>{drafts.length} saved</span>
          </div>
          <UiLinkButton
            href={competitionPath("/pools", competitionSlug)}
            variant="secondary"
            className="native-hidden"
          >
            Open Pools
          </UiLinkButton>
        </div>

        <div
          className="native-only-draft-actions"
          style={{
            display: "none",
            gap: 8,
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <Link
            href={competitionPath("/pools", competitionSlug)}
            className="native-only-icon-action"
            aria-label="Open pools"
            title="Open pools"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 19, height: 19 }}>
              <circle cx="9" cy="9" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="16.2" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M4.8 18.4c.5-2.7 2.7-4.4 5.4-4.4s4.9 1.7 5.4 4.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M14.4 15.2c2.1.2 3.8 1.4 4.5 3.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </Link>
          <button
            type="button"
            onClick={() => void createDraft()}
            disabled={creating || draftsLocked}
            className="native-only-icon-action native-only-icon-action--primary"
            aria-label={creating ? "Creating draft" : draftsLocked ? "Drafts locked" : "Create draft"}
            title={creating ? "Creating draft" : draftsLocked ? "Drafts locked" : "Create draft"}
          >
            <span aria-hidden="true" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>
              +
            </span>
          </button>
        </div>

        {draftsLocked ? <p className="drafts-lock-message">{lockMessage}</p> : null}

        <div className="drafts-create-row">
          <UiInput
            value={newDraftName}
            onChange={(event) => setNewDraftName(event.target.value)}
            disabled={draftsLocked || creating}
            placeholder={`New draft name (${defaultDraftName(drafts.length + 1)})`}
          />
          <UiButton
            type="button"
            onClick={() => void createDraft()}
            disabled={creating || draftsLocked}
            variant={draftsLocked ? "ghost" : "primary"}
            className="native-hidden"
          >
            {creating ? "Creating..." : draftsLocked ? "Drafts Locked" : "Create Draft"}
          </UiButton>
        </div>
      </section>

      {hasDrafts ? (
        <section className="drafts-list">
          {drafts.map((draft) => {
            const draftHref = returnPoolId
              ? competitionPathWithParams(`/drafts/${draft.id}`, competitionSlug, { returnPoolId })
              : competitionPath(`/drafts/${draft.id}`, competitionSlug);
            const enterPoolHref = returnPoolId
              ? competitionPathWithParams(`/pool/${returnPoolId}/draft`, competitionSlug, { draftId: draft.id })
              : competitionPath("/pools", competitionSlug);

            return (
            <UiCard
              as="article"
              className="drafts-draft-card drafts-draft-row"
              key={draft.id}
              style={{
                position: "relative",
              }}
            >
              <Link
                href={draftHref}
                className="drafts-draft-primary"
                title={`Open ${draft.name}`}
              >
                <span className="drafts-draft-name">
                  {draft.name}
                </span>
                <span className="drafts-draft-meta">
                  {pickCountByDraft[draft.id] ?? 0} teams selected - updated {formatUpdatedAt(draft.updated_at)}
                </span>
              </Link>

              <div className="drafts-draft-actions">
                <UiLinkButton
                  href={draftHref}
                  aria-label={`Edit ${draft.name}`}
                  title={`Edit ${draft.name}`}
                  size="sm"
                  style={{
                    width: 40,
                    height: 40,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  <PencilIcon />
                </UiLinkButton>
                <UiLinkButton
                  href={enterPoolHref}
                  className="drafts-enter-action"
                >
                  {returnPoolId ? "Enter in Pool" : "Join Pool(s)"}
                </UiLinkButton>
                <UiButton
                  type="button"
                  onClick={() => void deleteDraft(draft.id, draft.name)}
                  disabled={deletingDraftId === draft.id}
                  aria-label={deletingDraftId === draft.id ? `Deleting ${draft.name}` : `Delete ${draft.name}`}
                  title={deletingDraftId === draft.id ? "Deleting..." : `Delete ${draft.name}`}
                  variant="danger"
                  size="sm"
                  style={{
                    width: 40,
                    height: 40,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TrashIcon />
                </UiButton>
              </div>
            </UiCard>
          );
          })}
        </section>
      ) : (
        <section className="ui-empty-state" aria-label="No drafts">
          <strong>No drafts yet.</strong>
          <span>Create one above, then add teams and enter it into a pool.</span>
        </section>
      )}

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className="ui-status"
        >
          {message}
        </p>
      ) : null}
    </main>
  );
}

export default function DraftsPage() {
  return (
    <Suspense fallback={null}>
      <DraftsPageContent />
    </Suspense>
  );
}
