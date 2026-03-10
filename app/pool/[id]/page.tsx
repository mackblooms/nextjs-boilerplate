"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";

type Pool = {
  id: string;
  name: string;
  created_by: string;
  is_private: boolean | null;
};

type StatusTone = "success" | "error" | "info";
type StatusMessage = {
  tone: StatusTone;
  text: string;
};

type LiveScoreState = "LIVE" | "UPCOMING" | "FINAL";

type LiveScoreGame = {
  id: string;
  state: LiveScoreState;
  detail: string;
  startTime: string | null;
  awayTeamId: string | null;
  homeTeamId: string | null;
  awayTeamName: string;
  homeTeamName: string;
  awayLogoUrl: string | null;
  homeLogoUrl: string | null;
  awayTeam: string;
  homeTeam: string;
  awayScore: number | null;
  homeScore: number | null;
};

type LiveScoresResponse = {
  ok: boolean;
  games?: LiveScoreGame[];
  error?: string;
};

type EspnTeam = {
  id?: string | number;
  displayName?: string;
  abbreviation?: string;
  logos?: Array<{ href?: string }>;
  logo?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
  team?: EspnTeam;
};

type EspnEvent = {
  id?: string;
  date?: string;
  status?: {
    type?: {
      state?: string;
      completed?: boolean;
      shortDetail?: string;
    };
  };
  competitions?: Array<{
    competitors?: EspnCompetitor[];
  }>;
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

function yyyymmdd(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function shiftDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function toLiveState(rawState: string | undefined, completed: boolean | undefined): LiveScoreState {
  const state = rawState?.toLowerCase();
  if (state === "in") return "LIVE";
  if (state === "post" || completed) return "FINAL";
  return "UPCOMING";
}

function toScore(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeTeamKey(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[']/g, "")
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function teamNameVariants(name: string) {
  const base = normalizeTeamKey(name);
  const variants = new Set<string>([base]);

  if (base.includes(" state")) {
    variants.add(base.replace(/\bstate\b/g, "st"));
  }
  if (base.includes(" st")) {
    variants.add(base.replace(/\bst\b/g, "state"));
  }

  return variants;
}

function toLogoUrl(c: EspnCompetitor | undefined): string | null {
  const fromPayload = c?.team?.logo?.trim() || c?.team?.logos?.[0]?.href?.trim() || null;
  if (fromPayload) {
    return fromPayload.replace(/^http:\/\//i, "https://");
  }

  const teamId = c?.team?.id ? String(c.team.id) : null;
  if (!teamId) return null;
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png`;
}

function normalizeEspnEvent(event: EspnEvent): LiveScoreGame | null {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const awayDisplayName = away.team?.displayName?.trim() || away.team?.abbreviation?.trim() || "Away";
  const homeDisplayName = home.team?.displayName?.trim() || home.team?.abbreviation?.trim() || "Home";
  const awayLabel = away.team?.abbreviation?.trim() || awayDisplayName;
  const homeLabel = home.team?.abbreviation?.trim() || homeDisplayName;

  return {
    id: event.id ?? `${event.date ?? "game"}-${awayLabel}-${homeLabel}`,
    state: toLiveState(event.status?.type?.state, event.status?.type?.completed),
    detail: event.status?.type?.shortDetail?.trim() || "Scheduled",
    startTime: event.date ?? null,
    awayTeamId: away.team?.id ? String(away.team.id) : null,
    homeTeamId: home.team?.id ? String(home.team.id) : null,
    awayTeamName: awayDisplayName,
    homeTeamName: homeDisplayName,
    awayLogoUrl: toLogoUrl(away),
    homeLogoUrl: toLogoUrl(home),
    awayTeam: awayLabel,
    homeTeam: homeLabel,
    awayScore: toScore(away.score),
    homeScore: toScore(home.score),
  };
}

function sortScores(a: LiveScoreGame, b: LiveScoreGame) {
  const rank = (state: LiveScoreState) =>
    state === "LIVE" ? 0 : state === "UPCOMING" ? 1 : 2;

  const rankDiff = rank(a.state) - rank(b.state);
  if (rankDiff !== 0) return rankDiff;

  const ta = a.startTime ? Date.parse(a.startTime) : Number.POSITIVE_INFINITY;
  const tb = b.startTime ? Date.parse(b.startTime) : Number.POSITIVE_INFINITY;

  if (a.state === "FINAL") return tb - ta;
  return ta - tb;
}

function formatGameDateTimeET(startTime: string | null) {
  if (!startTime) return "Time TBD (ET)";
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return "Time TBD (ET)";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${formatted} ET`;
}

function statusLabel(game: LiveScoreGame) {
  const when = formatGameDateTimeET(game.startTime);
  if (game.state === "UPCOMING") return when;
  return `${when} • ${game.detail}`;
}

async function fetchEspnDirectScores(lookbackDays: number, lookaheadDays: number): Promise<LiveScoreGame[]> {
  const dateKeys: string[] = [];
  for (let day = -lookbackDays; day <= lookaheadDays; day++) {
    dateKeys.push(yyyymmdd(shiftDate(day)));
  }

  const payloads = await Promise.all(
    dateKeys.map(async (dateKey) => {
      const url =
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateKey}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`ESPN fetch failed (${res.status})`);
      }
      return (await res.json()) as EspnScoreboard;
    })
  );

  const out: LiveScoreGame[] = [];
  const seen = new Set<string>();
  for (const payload of payloads) {
    for (const event of payload.events ?? []) {
      const game = normalizeEspnEvent(event);
      if (!game) continue;
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      out.push(game);
    }
  }

  return out.sort(sortScores).slice(0, 18);
}

function ScoreSidebar({
  title,
  games,
  loading,
  error,
  emptyMessage,
}: {
  title: string;
  games: LiveScoreGame[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
}) {
  return (
    <aside
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        padding: 12,
        background: "var(--surface)",
        display: "grid",
        gap: 8,
        minHeight: 180,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15 }}>{title}</div>
      {loading ? <div style={{ opacity: 0.8 }}>Loading scores...</div> : null}
      {!loading && error ? <div style={{ opacity: 0.8 }}>{error}</div> : null}
      {!loading && !error && games.length === 0 ? (
        <div style={{ opacity: 0.8 }}>{emptyMessage}</div>
      ) : null}
      {!loading &&
        !error &&
        games.map((game) => (
          <article
            key={game.id}
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              padding: "8px 10px",
              background: "var(--surface-muted)",
              display: "grid",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span
                style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}
                title={game.awayTeamName}
              >
                {game.awayLogoUrl ? (
                  <img
                    src={game.awayLogoUrl}
                    alt={game.awayTeamName}
                    width={20}
                    height={20}
                    style={{ width: 20, height: 20, objectFit: "contain", flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ width: 20, height: 20, flexShrink: 0 }} />
                )}
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {game.awayTeam}
                </span>
              </span>
              <span style={{ fontWeight: 900 }}>{game.awayScore ?? "-"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span
                style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}
                title={game.homeTeamName}
              >
                {game.homeLogoUrl ? (
                  <img
                    src={game.homeLogoUrl}
                    alt={game.homeTeamName}
                    width={20}
                    height={20}
                    style={{ width: 20, height: 20, objectFit: "contain", flexShrink: 0 }}
                  />
                ) : (
                  <span style={{ width: 20, height: 20, flexShrink: 0 }} />
                )}
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {game.homeTeam}
                </span>
              </span>
              <span style={{ fontWeight: 900 }}>{game.homeScore ?? "-"}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{statusLabel(game)}</div>
          </article>
        ))}
    </aside>
  );
}

export default function PoolPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const shareLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/?invite=${encodeURIComponent(poolId)}`;
  }, [poolId]);

  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);
  const [scores, setScores] = useState<LiveScoreGame[]>([]);
  const [scoresLoading, setScoresLoading] = useState(true);
  const [scoresError, setScoresError] = useState<string | null>(null);
  const [draftedEspnIds, setDraftedEspnIds] = useState<string[]>([]);
  const [draftedTeamKeys, setDraftedTeamKeys] = useState<string[]>([]);
  const [draftedTeamCount, setDraftedTeamCount] = useState(0);
  const [draftedLoaded, setDraftedLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setStatus(null);
      setDraftedLoaded(false);

      const { data: poolData, error: poolErr } = await supabase
        .from("pools")
        .select("id,name,created_by,is_private")
        .eq("id", poolId)
        .single();

      if (poolErr) {
        setStatus({ tone: "error", text: poolErr.message });
        setLoading(false);
        return;
      }

      setPool(poolData as Pool);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        setIsMember(false);
        setDraftedEspnIds([]);
        setDraftedTeamKeys([]);
        setDraftedTeamCount(0);
        setDraftedLoaded(true);
        setLoading(false);
        return;
      }

      const { data: memberRow } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      setIsMember(!!memberRow);

      const { data: entryRows } = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .limit(1);

      const entryId = (entryRows?.[0]?.id as string | undefined) ?? null;
      if (!entryId) {
        setDraftedEspnIds([]);
        setDraftedTeamKeys([]);
        setDraftedTeamCount(0);
        setDraftedLoaded(true);
        setLoading(false);
        return;
      }

      const { data: pickRows } = await supabase
        .from("entry_picks")
        .select("team_id")
        .eq("entry_id", entryId);

      const pickedTeamIds = Array.from(
        new Set(((pickRows ?? []) as Array<{ team_id: string }>).map((p) => p.team_id).filter(Boolean))
      );

      if (pickedTeamIds.length === 0) {
        setDraftedEspnIds([]);
        setDraftedTeamKeys([]);
        setDraftedTeamCount(0);
        setDraftedLoaded(true);
        setLoading(false);
        return;
      }

      let teamRows:
        | Array<{ id: string; name: string; espn_team_id?: string | number | null }>
        | null = null;
      const { data: teamRowsWithEspn, error: teamErrWithEspn } = await supabase
        .from("teams")
        .select("id,name,espn_team_id")
        .in("id", pickedTeamIds);

      if (teamErrWithEspn && teamErrWithEspn.message.includes("espn_team_id")) {
        const { data: teamRowsBasic } = await supabase
          .from("teams")
          .select("id,name")
          .in("id", pickedTeamIds);
        teamRows = (teamRowsBasic ?? []) as Array<{ id: string; name: string }>;
      } else {
        teamRows = (teamRowsWithEspn ?? []) as Array<{
          id: string;
          name: string;
          espn_team_id?: string | number | null;
        }>;
      }

      const espnIdSet = new Set<string>();
      const keySet = new Set<string>();
      for (const row of teamRows ?? []) {
        if (row.espn_team_id != null) espnIdSet.add(String(row.espn_team_id));
        for (const variant of teamNameVariants(String(row.name ?? ""))) {
          if (variant) keySet.add(variant);
        }
      }

      setDraftedEspnIds(Array.from(espnIdSet));
      setDraftedTeamKeys(Array.from(keySet));
      setDraftedTeamCount(pickedTeamIds.length);
      setDraftedLoaded(true);
      setLoading(false);
    };

    load();
  }, [poolId]);

  useEffect(() => {
    if (!copyMsg) return;

    const timeout = window.setTimeout(() => setCopyMsg(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [copyMsg]);

  useEffect(() => {
    let canceled = false;

    const loadScores = async () => {
      try {
        const lookbackDays = 2;
        const lookaheadDays = 2;
        let nextScores: LiveScoreGame[] = [];
        let apiError: string | null = null;

        try {
          const res = await fetch(
            `/api/scores/live?lookbackDays=${lookbackDays}&lookaheadDays=${lookaheadDays}`,
            { cache: "no-store" }
          );
          const payload = (await res.json()) as LiveScoresResponse;
          if (!res.ok || !payload.ok) {
            throw new Error(payload.error ?? `Score fetch failed (${res.status})`);
          }
          nextScores = payload.games ?? [];
        } catch (e: unknown) {
          apiError = e instanceof Error ? e.message : "Unknown API error";
          nextScores = await fetchEspnDirectScores(lookbackDays, lookaheadDays);
        }

        if (!canceled) {
          setScores(nextScores);
          setScoresError(nextScores.length === 0 && apiError ? `Live feed issue: ${apiError}` : null);
        }
      } catch (e: unknown) {
        if (!canceled) {
          setScores([]);
          setScoresError(e instanceof Error ? e.message : "Could not load scores.");
        }
      } finally {
        if (!canceled) setScoresLoading(false);
      }
    };

    loadScores();
    const interval = window.setInterval(loadScores, 45_000);

    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function joinPool() {
    setStatus(null);
    setJoining(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setStatus({ tone: "error", text: "Please log in first." });
      setJoining(false);
      return;
    }

    const poolIsPrivate = (pool?.is_private ?? true) !== false;
    if (poolIsPrivate && !joinPassword.trim()) {
      setStatus({ tone: "error", text: "Enter this pool's password." });
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
      setStatus({ tone: "error", text: body.error ?? "Failed to join pool." });
      setJoining(false);
      return;
    }

    setIsMember(true);
    setJoinPassword("");
    setStatus({ tone: "success", text: "Joined! You can now access Draft, Bracket, and Leaderboard." });
    setJoining(false);
  }

  async function copyShareLink() {
    if (!shareLink) return;

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyMsg("Share link copied.");
    } catch {
      setCopyMsg("Unable to copy automatically. You can copy it from the field below.");
    }
  }

  const poolIsPrivate = (pool?.is_private ?? true) !== false;
  const joinDisabled = joining || (poolIsPrivate && joinPassword.trim().length === 0);
  const draftedEspnIdSet = useMemo(() => new Set(draftedEspnIds), [draftedEspnIds]);
  const draftedKeySet = useMemo(() => new Set(draftedTeamKeys), [draftedTeamKeys]);
  const draftedTeamScores = useMemo(
    () =>
      scores.filter((g) => {
        if (g.awayTeamId && draftedEspnIdSet.has(g.awayTeamId)) return true;
        if (g.homeTeamId && draftedEspnIdSet.has(g.homeTeamId)) return true;

        const awayKey = normalizeTeamKey(g.awayTeamName || g.awayTeam);
        const homeKey = normalizeTeamKey(g.homeTeamName || g.homeTeam);
        return draftedKeySet.has(awayKey) || draftedKeySet.has(homeKey);
      }),
    [scores, draftedEspnIdSet, draftedKeySet]
  );
  const liveAndUpcoming = useMemo(
    () => draftedTeamScores.filter((g) => g.state !== "FINAL").slice(0, 6),
    [draftedTeamScores]
  );
  const finals = useMemo(
    () => draftedTeamScores.filter((g) => g.state === "FINAL").slice(0, 6),
    [draftedTeamScores]
  );
  const scoreEmptyMessage = useMemo(() => {
    if (!draftedLoaded) return "Loading your drafted teams...";
    if (isMember !== true) return "Join this pool to see your drafted-team scores.";
    if (draftedTeamCount === 0) return "Draft teams first, then your games will show here.";
    return "No games for your drafted teams right now.";
  }, [draftedLoaded, isMember, draftedTeamCount]);

  const statusStyle =
    status?.tone === "success"
      ? { background: "var(--success-bg)", borderColor: "var(--border-color)" }
      : status?.tone === "error"
        ? { background: "var(--danger-bg)", borderColor: "var(--border-color)" }
        : { background: "var(--surface-muted)", borderColor: "var(--border-color)" };

  return (
    <main style={{ maxWidth: 1320, margin: "28px auto", padding: 12 }}>
      <div className="pool-hero-layout">
        <div className="pool-scores-left">
          <ScoreSidebar
            title="Recent Finals"
            games={finals}
            loading={scoresLoading || !draftedLoaded}
            error={scoresError}
            emptyMessage={scoreEmptyMessage}
          />
        </div>

        <div
          className="pool-main-card"
          style={{
            display: "grid",
            gap: 16,
            border: "1px solid var(--border-color)",
            borderRadius: 16,
            padding: "16px 12px",
            background: "var(--surface)",
          }}
        >
        <div style={{ display: "grid", justifyItems: "center", textAlign: "center", gap: 10 }}>
          <button
            onClick={copyShareLink}
            aria-label="Copy shareable pool link"
            title="Copy shareable pool link"
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              lineHeight: 0,
            }}
          >
            <Image
              src="/pool-logo.svg?v=2"
              alt=""
              aria-hidden="true"
              width={420}
              height={170}
              priority
              style={{
                maxWidth: "100%",
                height: "auto",
                filter: "var(--logo-filter)",
              }}
            />
          </button>

          <div style={{ fontSize: 14, opacity: 0.85, fontWeight: 700 }}>
            Click logo to copy the shareable pool link
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>
            {pool?.name ?? (loading ? "Loading pool..." : "Pool")}
          </h1>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
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
            {isMember === true ? (
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
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label htmlFor="share-link" style={{ fontWeight: 800, fontSize: 13 }}>
            Share link
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              id="share-link"
              type="text"
              value={shareLink}
              readOnly
              style={{
                flex: "1 1 260px",
                minWidth: 0,
                padding: "10px 12px",
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            />
            <button
              type="button"
              onClick={copyShareLink}
              style={{
                flex: "1 1 140px",
                padding: "10px 12px",
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface)",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Copy link
            </button>
          </div>
          {copyMsg ? <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{copyMsg}</p> : null}
        </div>

        {isMember === false && !loading ? (
          <section
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 12,
              background: "var(--surface-muted)",
              width: "100%",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Join this pool</h2>
            <p style={{ margin: "6px 0 0", opacity: 0.85, fontSize: 14 }}>
              {poolIsPrivate
                ? "This is a private pool. Enter the pool password to join."
                : "This is a public pool. Join now to make picks and track results."}
            </p>
            <div style={{ marginTop: 12, width: "100%", maxWidth: 420 }}>
              {poolIsPrivate ? (
                <input
                  type="password"
                  value={joinPassword}
                  onChange={(e) => setJoinPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !joinDisabled) {
                      void joinPool();
                    }
                  }}
                  placeholder="Pool password"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    minHeight: 44,
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    marginBottom: 10,
                    background: "var(--surface)",
                  }}
                />
              ) : null}

              <button
                type="button"
                onClick={joinPool}
                disabled={joinDisabled}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  cursor: joinDisabled ? "not-allowed" : "pointer",
                  fontWeight: 900,
                  opacity: joinDisabled ? 0.7 : 1,
                }}
              >
                {joining ? "Joining..." : "Join pool"}
              </button>
            </div>
          </section>
        ) : null}

        {isMember === true ? (
          <section
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 12,
              background: "var(--surface-muted)",
              width: "100%",
              display: "grid",
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Quick actions</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link
                href={`/pool/${poolId}/draft`}
                style={{
                  flex: "1 1 140px",
                  minWidth: 120,
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Draft
              </Link>
              <Link
                href={`/pool/${poolId}/bracket`}
                style={{
                  flex: "1 1 140px",
                  minWidth: 120,
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Bracket
              </Link>
              <Link
                href={`/pool/${poolId}/leaderboard`}
                style={{
                  flex: "1 1 140px",
                  minWidth: 120,
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                Leaderboard
              </Link>
            </div>
          </section>
        ) : null}

        {loading ? <p style={{ margin: 0, fontWeight: 700, opacity: 0.85 }}>Checking your membership...</p> : null}

        {status ? (
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
            {status.text}
          </p>
        ) : null}
        </div>

        <div className="pool-scores-right">
          <ScoreSidebar
            title="Live / Upcoming"
            games={liveAndUpcoming}
            loading={scoresLoading || !draftedLoaded}
            error={scoresError}
            emptyMessage={scoreEmptyMessage}
          />
        </div>
      </div>
    </main>
  );
}
