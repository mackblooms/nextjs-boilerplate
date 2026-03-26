"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { draftLibraryLockMessage, isDraftLibraryLocked } from "@/lib/draftLock";
import { supabase } from "@/lib/supabaseClient";
import { defaultDraftName, isMissingSavedDraftTablesError, type SavedDraftRow } from "@/lib/savedDrafts";
import { UiButton, UiCard, UiInput, UiLinkButton } from "../components/ui/primitives";

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

export default function DraftsPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [pickCountByDraft, setPickCountByDraft] = useState<Record<string, number>>({});

  const [newDraftName, setNewDraftName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const draftsLocked = isDraftLibraryLocked();
  const lockMessage = draftLibraryLockMessage();

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

      const { data: draftRows, error: draftErr } = await supabase
        .from("saved_drafts")
        .select("id,name,created_at,updated_at,user_id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

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
  }, []);

  async function createDraft() {
    if (isDraftLibraryLocked()) {
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
      })
      .select("id,name,created_at,updated_at")
      .single();

    if (error || !created) {
      setCreating(false);
      setMessage(error?.message ?? "Failed to create draft.");
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
    setMessage(`Created "${nextDraft.name}".`);
  }

  async function deleteDraft(draftId: string, draftName: string) {
    if (isDraftLibraryLocked()) {
      setMessage(lockMessage);
      return;
    }

    const ok = window.confirm(`Delete "${draftName}"?`);
    if (!ok) return;

    setDeletingDraftId(draftId);
    setMessage("");

    const { error } = await supabase
      .from("saved_drafts")
      .delete()
      .eq("id", draftId);

    if (error) {
      setDeletingDraftId(null);
      setMessage(error.message);
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
          My Drafts
        </h1>
        <p style={{ marginTop: 12 }}>Loading drafts...</p>
      </main>
    );
  }

  return (
    <main className="page-shell page-shell--stack" style={{ maxWidth: 960 }}>
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
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>My Drafts</h1>
            <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
              {draftsLocked ? lockMessage : "Create multiple drafts here, then open one to edit teams and save."}
            </p>
          </div>
          <UiLinkButton
            href="/pools"
            variant="secondary"
            style={{ height: "fit-content" }}
          >
            Open Pools
          </UiLinkButton>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <UiInput
            value={newDraftName}
            onChange={(event) => setNewDraftName(event.target.value)}
            disabled={draftsLocked || creating}
            placeholder={`New draft name (default: ${defaultDraftName(drafts.length + 1)})`}
            style={{
              flex: "1 1 300px",
              minWidth: 220,
            }}
          />
          <UiButton
            type="button"
            onClick={() => void createDraft()}
            disabled={creating || draftsLocked}
            variant={draftsLocked ? "ghost" : "primary"}
          >
            {creating ? "Creating..." : draftsLocked ? "Drafts Locked" : "Create Draft"}
          </UiButton>
        </div>
      </section>

      {hasDrafts ? (
        <section style={{ display: "grid", gap: 10 }}>
          {drafts.map((draft) => (
            <UiCard
              as="article"
              className="drafts-draft-card"
              key={draft.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <Link
                  href={`/drafts/${draft.id}`}
                  className="drafts-draft-link"
                  title={`Open ${draft.name}`}
                  style={{
                    fontWeight: 900,
                    fontSize: 18,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "inherit",
                  }}
                >
                  {draft.name}
                </Link>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {pickCountByDraft[draft.id] ?? 0} teams selected - updated {formatUpdatedAt(draft.updated_at)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <UiLinkButton
                  href="/pools"
                >
                  Join Pool(s)
                </UiLinkButton>
                <UiButton
                  type="button"
                  onClick={() => void deleteDraft(draft.id, draft.name)}
                  disabled={deletingDraftId === draft.id || draftsLocked}
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
          ))}
        </section>
      ) : (
        <UiCard>
          No drafts yet. Create one above.
        </UiCard>
      )}

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
