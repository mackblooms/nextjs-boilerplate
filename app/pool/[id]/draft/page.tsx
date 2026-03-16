"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  BracketBoard,
  type BracketBoardGame,
  type BracketBoardTeam,
} from "../../../components/BracketBoard";
import { supabase } from "../../../../lib/supabaseClient";
import { trackEvent } from "@/lib/analytics";

type Team = {
  id: string;
  name: string;
  seed: number;
  seed_in_region: number | null;
  cost: number;
  logo_url?: string | null;
};

type EntryRow = { id: string; entry_name: string | null };
type PickTeamRow = { team_id: string };

const BUDGET = 100;
const MAX_1 = 2;
const MAX_2 = 2;
const MAX_12 = 4;
const MAX_141516 = 6;

export default function DraftPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [games, setGames] = useState<BracketBoardGame[]>([]);

  const [entryId, setEntryId] = useState<string | null>(null);
  const [entryName, setEntryName] = useState("");
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [locked, setLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);
  const [poolIsPrivate, setPoolIsPrivate] = useState(true);
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);
  const [showBracketModal, setShowBracketModal] = useState(false);
  const [showClearDraftModal, setShowClearDraftModal] = useState(false);
  const [clearDraftEntryId, setClearDraftEntryId] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState(true);

  const bracketViewportRef = useRef<HTMLDivElement | null>(null);
  const bracketContentRef = useRef<HTMLDivElement | null>(null);

  const selectedTeams = useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t]));
    return Array.from(selected)
      .map((id) => map.get(id))
      .filter(Boolean) as Team[];
  }, [selected, teams]);

  const totalCost = useMemo(
    () => selectedTeams.reduce((sum, t) => sum + t.cost, 0),
    [selectedTeams],
  );

  const remaining = BUDGET - totalCost;

  const count1 = useMemo(
    () => selectedTeams.filter((t) => t.seed === 1).length,
    [selectedTeams],
  );
  const count2 = useMemo(
    () => selectedTeams.filter((t) => t.seed === 2).length,
    [selectedTeams],
  );
  const count12 = count1 + count2;
  const count141516 = useMemo(
    () => selectedTeams.filter((t) => t.seed >= 14 && t.seed <= 16).length,
    [selectedTeams],
  );

  const isValid =
    totalCost <= BUDGET &&
    count1 <= MAX_1 &&
    count2 <= MAX_2 &&
    count12 <= MAX_12 &&
    count141516 <= MAX_141516;

  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      if (a.seed !== b.seed) return a.seed - b.seed;
      return a.name.localeCompare(b.name);
    });
  }, [teams]);

  const bracketTeams = useMemo<BracketBoardTeam[]>(
    () =>
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        seed_in_region: t.seed_in_region ?? t.seed,
        logo_url: t.logo_url ?? null,
      })),
    [teams],
  );

  const applyFitScale = useCallback(() => {
    const viewport = bracketViewportRef.current;
    const content = bracketContentRef.current;
    if (!viewport || !content) return;

    const next = Math.min(1, viewport.clientWidth / content.scrollWidth);
    setScale(Math.max(0.35, next));
  }, []);

  const isMissingEntryNameError = (message?: string) => {
    if (!message) return false;
    return (
      message.includes("column entries.entry_name does not exist") ||
      message.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
    );
  };

  const ensureEntry = useCallback(async (userId: string) => {
    const { data: rows, error: entrySelErr } = await supabase
      .from("entries")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", userId)
      .limit(1);

    if (entrySelErr) {
      return { entry: null as EntryRow | null, error: entrySelErr.message };
    }

    const existing = (((rows ?? []) as { id: string }[])[0] ?? null) as
      | { id: string }
      | null;

    if (existing) {
      return { entry: { id: existing.id, entry_name: null }, error: null };
    }

    const { data: newEntryWithName, error: namedInsErr } = await supabase
      .from("entries")
      .insert({
        pool_id: poolId,
        user_id: userId,
        entry_name: "My Bracket",
      })
      .select("id")
      .single();

    if (!namedInsErr && newEntryWithName) {
      return {
        entry: { id: newEntryWithName.id as string, entry_name: "My Bracket" },
        error: null,
      };
    }

    const missingEntryName = isMissingEntryNameError(namedInsErr?.message);

    if (!missingEntryName) {
      return {
        entry: null as EntryRow | null,
        error: namedInsErr?.message ?? "Failed to create entry.",
      };
    }

    const { data: newEntry, error: entryInsErr } = await supabase
      .from("entries")
      .insert({
        pool_id: poolId,
        user_id: userId,
      })
      .select("id")
      .single();

    if (entryInsErr || !newEntry) {
      return {
        entry: null as EntryRow | null,
        error: entryInsErr?.message ?? "Failed to create entry.",
      };
    }

    return { entry: { id: newEntry.id as string, entry_name: null }, error: null };
  }, [poolId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setMsg("Please log in first.");
        setLoading(false);
        return;
      }

      // ✅ Lock check (paste-in safe)
      const { data: poolRow, error: poolErr } = await supabase
        .from("pools")
        .select("lock_time,is_private")
        .eq("id", poolId)
        .single();

      if (poolErr) {
        setMsg(poolErr.message);
        setLoading(false);
        return;
      }

      if (poolRow?.lock_time) {
        setLockTime(poolRow.lock_time);
        const lock = new Date(poolRow.lock_time);
        setLocked(new Date() > lock);
      } else {
        setLocked(false);
      }

      setPoolIsPrivate((poolRow?.is_private ?? true) !== false);

      // Membership
      const { data: mem, error: memErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memErr) {
        setMsg(memErr.message);
        setLoading(false);
        return;
      }

      setIsMember(!!mem);

      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("id,round,region,slot,start_time,game_date,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }

      const loadedGames = (gameRows ?? []) as BracketBoardGame[];
      setGames(loadedGames);

      const r64TeamIds = Array.from(
        new Set(
          loadedGames
            .filter((g) => g.round === "R64")
            .flatMap((g) => [g.team1_id, g.team2_id])
            .filter((id): id is string => !!id),
        ),
      );

      let teamsQuery = supabase
        .from("teams")
        .select("id,name,seed,seed_in_region,cost,logo_url");
      if (r64TeamIds.length > 0) teamsQuery = teamsQuery.in("id", r64TeamIds);

      const { data: teamRows, error: teamErr } = await teamsQuery;

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }

      setTeams((teamRows ?? []) as Team[]);

      if (r64TeamIds.length === 0) {
        setMsg("Tournament field is still TBD in SportsDataIO. Draft teams will appear once R64 teams are assigned.");
      }

      if (!mem) {
        setEntryId(null);
        setSelected(new Set());
        setLoading(false);
        return;
      }

      const { entry, error: entryErr } = await ensureEntry(user.id);
      if (entryErr || !entry) {
        setMsg(entryErr ?? "Failed to load entry.");
        setLoading(false);
        return;
      }

      setEntryId(entry.id);
      setEntryName(entry.entry_name ?? "My Bracket");

      // Picks
      const { data: picks, error: picksErr } = await supabase
        .from("entry_picks")
        .select("team_id")
        .eq("entry_id", entry.id);

      if (picksErr) {
        setMsg(picksErr.message);
        setLoading(false);
        return;
      }

      setSelected(
        new Set(((picks ?? []) as PickTeamRow[]).map((p) => p.team_id)),
      );

      setLoading(false);
    };

    load();
  }, [poolId, ensureEntry]);

  useEffect(() => {
    const hasModalOpen = showBracketModal || showClearDraftModal;
    if (!hasModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showClearDraftModal && !clearing) {
        setShowClearDraftModal(false);
        setClearDraftEntryId(null);
      }
      if (showBracketModal) {
        setShowBracketModal(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [clearing, showBracketModal, showClearDraftModal]);

  useEffect(() => {
    if (!showBracketModal || !fitMode) return;

    const runFit = () => {
      window.requestAnimationFrame(applyFitScale);
    };

    runFit();
    window.addEventListener("resize", runFit);
    return () => window.removeEventListener("resize", runFit);
  }, [applyFitScale, fitMode, showBracketModal]);

  async function joinPool() {
    setMsg("");
    setJoining(true);
    trackEvent({
      eventName: "pool_join_attempt",
      poolId,
      metadata: { location: "draft_page", is_private: poolIsPrivate },
    });

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setMsg("Please log in first.");
      trackEvent({
        eventName: "pool_join_failure",
        poolId,
        metadata: { location: "draft_page", reason: "not_authenticated" },
      });
      setJoining(false);
      return;
    }

    if (poolIsPrivate && !joinPassword.trim()) {
      setMsg("Enter this pool's password.");
      trackEvent({
        eventName: "pool_join_failure",
        poolId,
        metadata: { location: "draft_page", reason: "missing_password" },
      });
      setJoining(false);
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
      setMsg(body.error ?? "Failed to join pool.");
      trackEvent({
        eventName: "pool_join_failure",
        poolId,
        metadata: { location: "draft_page", reason: body.error ?? "api_error" },
      });
      setJoining(false);
      return;
    }

    setIsMember(true);
    setJoinPassword("");

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setMsg("Joined, but failed to load your entry. Refresh and try again.");
      setJoining(false);
      return;
    }

    const { entry, error: entryErr } = await ensureEntry(user.id);
    if (entryErr || !entry) {
      setMsg(entryErr ?? "Joined, but failed to create entry.");
      setJoining(false);
      return;
    }

    setEntryId(entry.id);
    setEntryName(entry.entry_name ?? "My Bracket");

    const { data: picks, error: picksErr } = await supabase
      .from("entry_picks")
      .select("team_id")
      .eq("entry_id", entry.id);

    if (picksErr) {
      setMsg(picksErr.message);
      setJoining(false);
      return;
    }

    setSelected(new Set(((picks ?? []) as PickTeamRow[]).map((p) => p.team_id)));
    setMsg("Joined pool. You can draft now.");
    trackEvent({
      eventName: "pool_join_success",
      poolId,
      metadata: { location: "draft_page", is_private: poolIsPrivate },
    });
    setJoining(false);
  }

  function toggleTeam(teamId: string) {
    if (locked) return;

    setMsg("");

    const next = new Set(selected);
    const map = new Map(teams.map((t) => [t.id, t]));

    if (next.has(teamId)) {
      next.delete(teamId);
      setSelected(next);
      return;
    }

    next.add(teamId);

    const arr = Array.from(next)
      .map((id) => map.get(id))
      .filter(Boolean) as Team[];

    const cost = arr.reduce((s, t) => s + t.cost, 0);
    const c1 = arr.filter((t) => t.seed === 1).length;
    const c2 = arr.filter((t) => t.seed === 2).length;
    const c141516 = arr.filter((t) => t.seed >= 14 && t.seed <= 16).length;

    if (
      cost > BUDGET ||
      c1 > MAX_1 ||
      c2 > MAX_2 ||
      c1 + c2 > MAX_12 ||
      c141516 > MAX_141516
    ) {
      const t = map.get(teamId);
      setMsg(
        `Can't add ${t?.name ?? "that team"} — it would break budget or seed caps.`,
      );
      return;
    }

    setSelected(next);
  }

  async function savePicks() {
    setMsg("");
    trackEvent({
      eventName: "draft_save_attempt",
      poolId,
      entryId,
      metadata: {
        selected_count: selected.size,
        total_cost: totalCost,
        is_valid: isValid,
      },
    });

    let resolvedEntryId = entryId;
    if (!isMember) {
      setMsg("Join the pool before drafting.");
      trackEvent({
        eventName: "draft_save_failure",
        poolId,
        entryId,
        metadata: { reason: "not_member" },
      });
      return;
    }

    if (!resolvedEntryId) {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setMsg("Please log in first.");
        trackEvent({
          eventName: "draft_save_failure",
          poolId,
          entryId,
          metadata: { reason: "not_authenticated" },
        });
        return;
      }

      const { entry, error: entryErr } = await ensureEntry(user.id);
      if (entryErr || !entry) {
        setMsg(entryErr ?? "Entry not ready yet. Refresh and try again.");
        trackEvent({
          eventName: "draft_save_failure",
          poolId,
          entryId,
          metadata: { reason: entryErr ?? "entry_unavailable" },
        });
        return;
      }

      resolvedEntryId = entry.id;
      setEntryId(entry.id);
      if (!entryName.trim()) {
        setEntryName(entry.entry_name ?? "My Bracket");
      }
    }

    if (locked) {
      setMsg("Draft is locked.");
      trackEvent({
        eventName: "draft_save_failure",
        poolId,
        entryId: resolvedEntryId,
        metadata: { reason: "draft_locked" },
      });
      return;
    }
    if (!isValid) {
      setMsg("Draft is not valid (budget/caps). Fix issues before saving.");
      trackEvent({
        eventName: "draft_save_failure",
        poolId,
        entryId: resolvedEntryId,
        metadata: { reason: "invalid_draft" },
      });
      return;
    }

    const nickname = entryName.trim();

    setSaving(true);

    if (nickname) {
      const { error: entryUpdateErr } = await supabase
        .from("entries")
        .update({ entry_name: nickname })
        .eq("id", resolvedEntryId);

      if (entryUpdateErr && !isMissingEntryNameError(entryUpdateErr.message)) {
        setMsg(entryUpdateErr.message);
        trackEvent({
          eventName: "draft_save_failure",
          poolId,
          entryId: resolvedEntryId,
          metadata: { reason: entryUpdateErr.message },
        });
        setSaving(false);
        return;
      }
    }

    const { error: delErr } = await supabase
      .from("entry_picks")
      .delete()
      .eq("entry_id", resolvedEntryId);

    if (delErr) {
      setMsg(delErr.message);
      trackEvent({
        eventName: "draft_save_failure",
        poolId,
        entryId: resolvedEntryId,
        metadata: { reason: delErr.message },
      });
      setSaving(false);
      return;
    }

    const rows = Array.from(selected).map((team_id) => ({
      entry_id: resolvedEntryId,
      team_id,
    }));

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("entry_picks").insert(rows);
      if (insErr) {
        setMsg(insErr.message);
        trackEvent({
          eventName: "draft_save_failure",
          poolId,
          entryId: resolvedEntryId,
          metadata: { reason: insErr.message },
        });
        setSaving(false);
        return;
      }
    }

    setMsg("Saved!");
    trackEvent({
      eventName: "draft_save_success",
      poolId,
      entryId: resolvedEntryId,
      metadata: {
        selected_count: selected.size,
        total_cost: totalCost,
      },
    });
    setSaving(false);
  }

  async function clearDraft() {
    setMsg("");

    if (!isMember) {
      setMsg("Join the pool before drafting.");
      trackEvent({
        eventName: "draft_clear_failure",
        poolId,
        entryId,
        metadata: { reason: "not_member" },
      });
      return;
    }

    if (locked) {
      setMsg("Draft is locked.");
      trackEvent({
        eventName: "draft_clear_failure",
        poolId,
        entryId,
        metadata: { reason: "draft_locked" },
      });
      return;
    }

    let resolvedEntryId = entryId;
    if (!resolvedEntryId) {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        setMsg("Please log in first.");
        trackEvent({
          eventName: "draft_clear_failure",
          poolId,
          entryId,
          metadata: { reason: "not_authenticated" },
        });
        return;
      }

      const { entry, error: entryErr } = await ensureEntry(user.id);
      if (entryErr || !entry) {
        setMsg(entryErr ?? "Entry not ready yet. Refresh and try again.");
        trackEvent({
          eventName: "draft_clear_failure",
          poolId,
          entryId,
          metadata: { reason: entryErr ?? "entry_unavailable" },
        });
        return;
      }

      resolvedEntryId = entry.id;
      setEntryId(entry.id);
    }

    setClearDraftEntryId(resolvedEntryId);
    setShowClearDraftModal(true);
  }

  function closeClearDraftModal() {
    if (clearing) return;
    setShowClearDraftModal(false);
    setClearDraftEntryId(null);
  }

  async function confirmClearDraft() {
    if (!clearDraftEntryId) {
      setShowClearDraftModal(false);
      return;
    }

    setClearing(true);
    trackEvent({
      eventName: "draft_clear_attempt",
      poolId,
      entryId: clearDraftEntryId,
      metadata: {
        selected_count: selected.size,
      },
    });

    const { error: delErr } = await supabase
      .from("entry_picks")
      .delete()
      .eq("entry_id", clearDraftEntryId);

    if (delErr) {
      setMsg(delErr.message);
      trackEvent({
        eventName: "draft_clear_failure",
        poolId,
        entryId: clearDraftEntryId,
        metadata: { reason: delErr.message },
      });
      setClearing(false);
      setShowClearDraftModal(false);
      setClearDraftEntryId(null);
      return;
    }

    setSelected(new Set());
    setMsg("Draft cleared.");
    trackEvent({
      eventName: "draft_clear_success",
      poolId,
      entryId: clearDraftEntryId,
      metadata: { selected_count: 0 },
    });
    setClearing(false);
    setShowClearDraftModal(false);
    setClearDraftEntryId(null);
  }

  const setFit = () => {
    setFitMode(true);
    window.requestAnimationFrame(applyFitScale);
  };

  const set100 = () => {
    setFitMode(false);
    setScale(1);
  };

  const openBracketModal = () => {
    setFitMode(true);
    setShowBracketModal(true);
  };

  if (loading) {
    return (
      <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900 }}>Draft</h1>
        <p style={{ marginTop: 12 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1000, margin: "48px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
            Draft
          </h1>
          <div style={{ fontSize: 14, opacity: 0.85 }}>
            Budget: {BUDGET} • Caps: max {MAX_1} one-seeds, max {MAX_2}{" "}
            two-seeds, max {MAX_12} combined, max {MAX_141516} seeds 14-16
          </div>
        </div>

        {isMember ? (
          <button
            type="button"
            onClick={openBracketModal}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              background: "var(--surface)",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            View Bracket
          </button>
        ) : null}
      </div>

      {!isMember ? (
        <div style={{ marginTop: 18 }}>
          <p style={{ opacity: 0.9 }}>You are not a member of this pool yet.</p>
          {poolIsPrivate ? (
            <input
              type="password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              placeholder="Pool password"
              style={{
                marginTop: 10,
                width: "100%",
                maxWidth: 360,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
              }}
            />
          ) : null}
          <button
            onClick={joinPool}
            disabled={joining}
            style={{
              marginTop: 10,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              cursor: joining ? "not-allowed" : "pointer",
              fontWeight: 900,
              opacity: joining ? 0.7 : 1,
            }}
          >
            {joining ? "Joining..." : "Join pool"}
          </button>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 18,
        }}
      >
        {/* Team list */}
        <section
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 14,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Teams</div>

          <div style={{ display: "grid", gap: 8 }}>
            {sortedTeams.map((t) => {
              const checked = selected.has(t.id);
              return (
                <label
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 10px",
                    border: "1px solid var(--border-color)",
                    borderRadius: 10,
                    cursor: locked ? "not-allowed" : "pointer",
                    userSelect: "none",
                    opacity: locked ? 0.85 : 1,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggleTeam(t.id)}
                    />

                    {t.logo_url ? (
                      <img
                        src={t.logo_url}
                        alt={t.name}
                        width={20}
                        height={20}
                        style={{ objectFit: "contain", flexShrink: 0 }}
                      />
                    ) : (
                      <span style={{ width: 20, height: 20, flexShrink: 0 }} />
                    )}

                    <div>
                      <div style={{ fontWeight: 800 }}>{t.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        Seed {t.seed}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontWeight: 900 }}>{t.cost}</div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Sidebar */}
        <aside
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 14,
            height: "fit-content",
            position: "sticky",
            top: 16,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Summary</div>

          <label
            style={{
              display: "block",
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Bracket nickname
          </label>
          <input
            value={entryName}
            onChange={(e) => setEntryName(e.target.value)}
            placeholder="e.g., Cardiac Cinderellas"
            disabled={locked}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              marginBottom: 12,
              opacity: locked ? 0.8 : 1,
            }}
          />

          <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Total cost</span>
              <b>{totalCost}</b>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Remaining</span>
              <b>{remaining}</b>
            </div>

            <hr
              style={{
                border: "none",
                borderTop: "1px solid var(--border-color)",
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1-seeds</span>
              <b>
                {count1}/{MAX_1}
              </b>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>2-seeds</span>
              <b>
                {count2}/{MAX_2}
              </b>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1+2 combined</span>
              <b>
                {count12}/{MAX_12}
              </b>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>14-16 seeds</span>
              <b>
                {count141516}/{MAX_141516}
              </b>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: isValid ? "var(--success-bg)" : "var(--danger-bg)",
                fontWeight: 900,
              }}
            >
              {isValid ? "Draft is valid ✅" : "Draft invalid ❌"}
            </div>

            {locked ? (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "var(--warning-bg)",
                  border: "1px solid var(--warning-border)",
                  fontWeight: 900,
                }}
              >
                Draft Locked 🔒
              </div>
            ) : null}

            {lockTime && (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                Locks: {new Date(lockTime).toLocaleString()}
              </div>
            )}
          </div>

          <button
            onClick={savePicks}
            disabled={saving || clearing || !isMember || !isValid || locked}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              cursor: saving || clearing ? "not-allowed" : "pointer",
              fontWeight: 900,
              opacity: saving || clearing || !isMember || !isValid || locked ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : locked ? "Draft Locked" : "Save picks"}
          </button>

          <button
            type="button"
            onClick={clearDraft}
            disabled={showClearDraftModal || clearing || saving || !isMember || locked}
            style={{
              marginTop: 10,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              cursor: showClearDraftModal || clearing || saving ? "not-allowed" : "pointer",
              fontWeight: 900,
              opacity: showClearDraftModal || clearing || saving || !isMember || locked ? 0.6 : 1,
            }}
          >
            {clearing ? "Clearing..." : "Clear Draft"}
          </button>

          {msg ? (
            <p style={{ marginTop: 12, fontSize: 14, whiteSpace: "pre-wrap" }}>
              {msg}
            </p>
          ) : null}
        </aside>
      </div>

      {showClearDraftModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Clear draft confirmation"
          onClick={closeClearDraftModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            zIndex: 2100,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 460px)",
              borderRadius: 14,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 900 }}>Clear Draft?</div>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
              This will remove all drafted teams from your entry immediately.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={closeClearDraftModal}
                disabled={clearing}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 800,
                  cursor: clearing ? "not-allowed" : "pointer",
                  opacity: clearing ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearDraft}
                disabled={clearing}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--danger-bg)",
                  fontWeight: 900,
                  cursor: clearing ? "not-allowed" : "pointer",
                  opacity: clearing ? 0.7 : 1,
                }}
              >
                {clearing ? "Clearing..." : "Yes, Clear Draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBracketModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bracket preview"
          onClick={() => setShowBracketModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--surface)",
            zIndex: 2000,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(96vw, 1900px)",
              maxHeight: "92vh",
              borderRadius: 14,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 12,
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                Bracket Preview
              </div>
              <button
                type="button"
                onClick={() => setShowBracketModal(false)}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface)",
                  padding: "8px 10px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Your selected teams are highlighted in yellow.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 12 }}>View:</div>
                <button
                  type="button"
                  onClick={setFit}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: fitMode ? "var(--surface-elevated)" : "var(--surface)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={set100}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background:
                      !fitMode && scale === 1
                        ? "var(--surface-elevated)"
                        : "var(--surface)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  100%
                </button>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Zoom: <b>{Math.round(scale * 100)}%</b>
                </div>
              </div>
            </div>

            <div ref={bracketViewportRef} style={{ padding: 12, overflow: "auto" }}>
              <div
                ref={bracketContentRef}
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  width: "max-content",
                  margin: "0 auto",
                }}
              >
                <BracketBoard
                  teams={bracketTeams}
                  games={games}
                  highlightTeamIds={selected}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

