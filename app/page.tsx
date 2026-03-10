"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

type LiveScoreState = "LIVE" | "UPCOMING" | "FINAL";

type LiveScoreGame = {
  id: string;
  state: LiveScoreState;
  detail: string;
  startTime: string | null;
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
  displayName?: string;
  abbreviation?: string;
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

const buttonStyle = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid var(--border-color)",
  textDecoration: "none",
  fontWeight: 800,
  minWidth: 170,
  textAlign: "center" as const,
};

const scorePanelStyle = {
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  padding: 12,
  background: "var(--surface)",
  display: "grid",
  gap: 8,
  minHeight: 180,
};

const scoreRowStyle = {
  border: "1px solid var(--border-color)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "var(--surface-muted)",
  display: "grid",
  gap: 4,
};

function formatTipoff(startTime: string | null) {
  if (!startTime) return "Scheduled";
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return "Scheduled";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function statusLabel(game: LiveScoreGame) {
  if (game.state === "UPCOMING") return formatTipoff(game.startTime);
  return game.detail;
}

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

function toState(rawState: string | undefined, completed: boolean | undefined): LiveScoreState {
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

function normalizeEspnEvent(event: EspnEvent): LiveScoreGame | null {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const awayName = away.team?.abbreviation?.trim() || away.team?.displayName?.trim() || "AWAY";
  const homeName = home.team?.abbreviation?.trim() || home.team?.displayName?.trim() || "HOME";

  return {
    id: event.id ?? `${event.date ?? "game"}-${awayName}-${homeName}`,
    state: toState(event.status?.type?.state, event.status?.type?.completed),
    detail: event.status?.type?.shortDetail?.trim() || "Scheduled",
    startTime: event.date ?? null,
    awayTeam: awayName,
    homeTeam: homeName,
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

async function fetchEspnDirectScores(): Promise<LiveScoreGame[]> {
  const dateKeys = [yyyymmdd(shiftDate(-1)), yyyymmdd(shiftDate(0)), yyyymmdd(shiftDate(1))];
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

function ScorePanel({
  title,
  games,
  loading,
  error,
}: {
  title: string;
  games: LiveScoreGame[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <aside style={scorePanelStyle}>
      <div style={{ fontWeight: 900, fontSize: 15 }}>{title}</div>
      {loading ? <div style={{ opacity: 0.8 }}>Loading scores...</div> : null}
      {!loading && error ? <div style={{ opacity: 0.8 }}>{error}</div> : null}
      {!loading && !error && games.length === 0 ? (
        <div style={{ opacity: 0.8 }}>No games found right now.</div>
      ) : null}
      {!loading &&
        !error &&
        games.map((game) => (
          <article key={game.id} style={scoreRowStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 700 }}>{game.awayTeam}</span>
              <span style={{ fontWeight: 900 }}>{game.awayScore ?? "-"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 700 }}>{game.homeTeam}</span>
              <span style={{ fontWeight: 900 }}>{game.homeScore ?? "-"}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{statusLabel(game)}</div>
          </article>
        ))}
    </aside>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const invitePoolId = searchParams.get("invite");
  const [invitePoolName, setInvitePoolName] = useState<string | null>(null);
  const [scores, setScores] = useState<LiveScoreGame[]>([]);
  const [scoresLoading, setScoresLoading] = useState(true);
  const [scoresError, setScoresError] = useState<string | null>(null);

  const loginHref = useMemo(() => {
    if (!invitePoolId) return "/login";
    const params = new URLSearchParams({
      next: `/pool/${invitePoolId}`,
      invitePoolId,
    });
    return `/login?${params.toString()}`;
  }, [invitePoolId]);

  useEffect(() => {
    const loadInvitePoolName = async () => {
      if (!invitePoolId) {
        setInvitePoolName(null);
        return;
      }

      const { data } = await supabase
        .from("pools")
        .select("name")
        .eq("id", invitePoolId)
        .maybeSingle();

      setInvitePoolName(data?.name ?? null);
    };

    loadInvitePoolName();
  }, [invitePoolId]);

  useEffect(() => {
    let canceled = false;

    const loadScores = async () => {
      try {
        let nextScores: LiveScoreGame[] = [];
        let apiError: string | null = null;

        try {
          const res = await fetch("/api/scores/live", { cache: "no-store" });
          const payload = (await res.json()) as LiveScoresResponse;
          if (!res.ok || !payload.ok) {
            throw new Error(payload.error ?? `Score fetch failed (${res.status})`);
          }
          nextScores = payload.games ?? [];
        } catch (e: unknown) {
          apiError = e instanceof Error ? e.message : "Unknown API error";
          nextScores = await fetchEspnDirectScores();
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

  const liveAndUpcoming = useMemo(
    () => scores.filter((g) => g.state !== "FINAL").slice(0, 6),
    [scores]
  );
  const finals = useMemo(() => scores.filter((g) => g.state === "FINAL").slice(0, 6), [scores]);

  return (
    <main
      style={{
        maxWidth: 1240,
        margin: "40px auto",
        padding: 16,
      }}
    >
      <div className="home-layout">
        <div className="home-scores-left">
          <ScorePanel
            title="Live / Upcoming"
            games={liveAndUpcoming}
            loading={scoresLoading}
            error={scoresError}
          />
        </div>

        <section
          className="home-center"
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            padding: 20,
            background: "var(--surface)",
            display: "grid",
            justifyItems: "center",
            textAlign: "center",
            gap: 20,
          }}
        >
          <Image
            src="/pool-logo.svg?v=2"
            alt="bracketball logo"
            width={560}
            height={206}
            priority
            style={{ width: "min(100%, 560px)", height: "auto", filter: "var(--logo-filter)" }}
          />

          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>
            bracketball (beta)
          </h1>

          {invitePoolId ? (
            <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              You are being invited to join <b>{invitePoolName ?? "this pool"}</b>.
            </p>
          ) : null}

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link href="/how-it-works" style={buttonStyle}>
              How it works
            </Link>
            <Link href="/pools/new" style={buttonStyle}>
              Create a pool
            </Link>
            <Link href={loginHref} style={buttonStyle}>
              Login / Sign up
            </Link>
          </div>
        </section>

        <div className="home-scores-right">
          <ScorePanel title="Recent Finals" games={finals} loading={scoresLoading} error={scoresError} />
        </div>
      </div>
    </main>
  );
}

function HomeFallback() {
  return (
    <main
      style={{
        maxWidth: 1240,
        margin: "40px auto",
        padding: 16,
      }}
    >
      <div className="home-layout">
        <div className="home-scores-left">
          <ScorePanel title="Live / Upcoming" games={[]} loading error={null} />
        </div>

        <section
          className="home-center"
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            padding: 20,
            background: "var(--surface)",
            display: "grid",
            justifyItems: "center",
            textAlign: "center",
            gap: 20,
          }}
        >
          <Image
            src="/pool-logo.svg?v=2"
            alt="bracketball logo"
            width={560}
            height={206}
            priority
            style={{ width: "min(100%, 560px)", height: "auto", filter: "var(--logo-filter)" }}
          />

          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>
            bracketball (beta)
          </h1>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link href="/how-it-works" style={buttonStyle}>
              How it works
            </Link>
            <Link href="/pools/new" style={buttonStyle}>
              Create a pool
            </Link>
            <Link href="/login" style={buttonStyle}>
              Login / Sign up
            </Link>
          </div>
        </section>

        <div className="home-scores-right">
          <ScorePanel title="Recent Finals" games={[]} loading error={null} />
        </div>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HomeContent />
    </Suspense>
  );
}
