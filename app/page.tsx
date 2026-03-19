"use client";

import { type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { trackEvent } from "@/lib/analytics";
import { isMissingSavedDraftTablesError, sameTeamSet, type SavedDraftRow } from "@/lib/savedDrafts";

type LiveScoreState = "LIVE" | "UPCOMING" | "FINAL";

type LiveScoreGame = {
  id: string;
  boxScoreUrl: string | null;
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
  name?: string;
  shortName?: string;
  status?: {
    type?: {
      state?: string;
      completed?: boolean;
      shortDetail?: string;
    };
  };
  competitions?: Array<{
    tournamentId?: number | string;
    notes?: Array<{ headline?: string }>;
    headlines?: Array<{ shortLinkText?: string; description?: string }>;
    competitors?: EspnCompetitor[];
  }>;
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

type TeamLookupRow = {
  id: string;
  name: string;
  espn_team_id?: string | number | null;
};

type PoolOption = {
  id: string;
  name: string;
};

type HomeDraftPool = {
  id: string;
  name: string;
  place: number | null;
};

type HomeDraftRow = Pick<SavedDraftRow, "id" | "name" | "created_at" | "updated_at">;
type DraftPickRow = {
  draft_id: string;
  team_id: string;
};
type DraftPoolEntryRow = {
  id: string;
  pool_id: string;
  entry_name: string | null;
};
type DraftPoolEntryPickRow = {
  entry_id: string;
  team_id: string;
};
type DraftPoolLeaderboardRow = {
  entry_id: string;
  pool_id: string;
  total_score: number | null;
};

type ScoreViewMode = "my-teams" | "all-scores";

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

const LANDING_LOOKBACK_DAYS = 1;
const LANDING_LOOKAHEAD_DAYS = 1;
const SCORING_UPDATE_VERSION = "2026-03-perfect-r64";
const SCORING_UPDATE_SEEN_KEY = `bb:scoring-update-seen:${SCORING_UPDATE_VERSION}`;
const MAX_HOME_DRAFTS = 10;

function sortDraftsByUpdatedAt(a: HomeDraftRow, b: HomeDraftRow) {
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}

function isMissingEntryNameError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.entry_name does not exist") ||
    message.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
  );
}

function normalizeDraftName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatPlace(place: number | null) {
  if (!place || place < 1) return "Place unavailable";
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th place`;
  const mod10 = place % 10;
  if (mod10 === 1) return `${place}st place`;
  if (mod10 === 2) return `${place}nd place`;
  if (mod10 === 3) return `${place}rd place`;
  return `${place}th place`;
}

function overlapCount(a: Iterable<string>, b: Set<string>) {
  let out = 0;
  for (const value of a) {
    if (b.has(value)) out += 1;
  }
  return out;
}

function PenIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
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
  return `${when} - ${game.detail}`;
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

function toLogoUrl(c: EspnCompetitor | undefined): string | null {
  const fromPayload = c?.team?.logo?.trim() || c?.team?.logos?.[0]?.href?.trim() || null;
  if (fromPayload) {
    return fromPayload.replace(/^http:\/\//i, "https://");
  }

  const teamId = c?.team?.id ? String(c.team.id) : null;
  if (!teamId) return null;
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png`;
}

function etDayKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  const day = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function etDayKeyFromIso(startTime: string | null) {
  if (!startTime) return null;
  const d = new Date(startTime);
  if (Number.isNaN(d.getTime())) return null;
  return etDayKey(d);
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

function isNcaaTournamentEvent(event: EspnEvent) {
  const comp = event.competitions?.[0];
  if (!comp) return false;

  const excludedPhrases = [
    "nit",
    "national invitation tournament",
    "college basketball crown",
    "cbi",
    "college basketball invitational",
    "the crown",
  ];

  const tournamentId = Number(comp.tournamentId);
  if (Number.isFinite(tournamentId)) {
    return tournamentId === 22;
  }

  const notesText = (comp.notes ?? [])
    .map((n) => n.headline ?? "")
    .join(" ")
    .toLowerCase();

  const headlineText = (comp.headlines ?? [])
    .map((h) => `${h.shortLinkText ?? ""} ${h.description ?? ""}`)
    .join(" ")
    .toLowerCase();

  const eventText = `${event.name ?? ""} ${event.shortName ?? ""}`.toLowerCase();
  const combined = `${notesText} ${headlineText} ${eventText}`;
  if (excludedPhrases.some((phrase) => combined.includes(phrase))) return false;

  if (combined.includes("men's basketball championship")) return true;
  if (combined.includes("mens basketball championship")) return true;
  if (combined.includes("ncaa tournament")) return true;
  if (combined.includes("ncaa men's tournament")) return true;
  if (combined.includes("march madness")) return true;

  return false;
}

function sortPoolsByName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

function isTrackedTeam(
  gameTeamId: string | null,
  gameTeamName: string,
  fallbackLabel: string,
  trackedEspnSet: Set<string>,
  trackedKeySet: Set<string>
) {
  if (gameTeamId && trackedEspnSet.has(gameTeamId)) return true;
  const key = normalizeTeamKey(gameTeamName || fallbackLabel);
  return trackedKeySet.has(key);
}

function gameHasTrackedTeam(
  game: LiveScoreGame,
  trackedEspnSet: Set<string>,
  trackedKeySet: Set<string>
) {
  return (
    isTrackedTeam(game.awayTeamId, game.awayTeamName, game.awayTeam, trackedEspnSet, trackedKeySet) ||
    isTrackedTeam(game.homeTeamId, game.homeTeamName, game.homeTeam, trackedEspnSet, trackedKeySet)
  );
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

  const eventId = event.id?.trim() || null;
  const boxScoreUrl = eventId && /^\d+$/.test(eventId)
    ? `https://www.espn.com/mens-college-basketball/boxscore/_/gameId/${eventId}`
    : null;

  return {
    id: eventId ?? `${event.date ?? "game"}-${awayLabel}-${homeLabel}`,
    boxScoreUrl,
    state: toState(event.status?.type?.state, event.status?.type?.completed),
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

async function fetchEspnDirectScores(
  lookbackDays: number,
  lookaheadDays: number
): Promise<LiveScoreGame[]> {
  const dateKeys: string[] = [];
  for (let day = -lookbackDays; day <= lookaheadDays; day++) {
    dateKeys.push(yyyymmdd(shiftDate(day)));
  }

  const payloads = await Promise.all(
    dateKeys.map(async (dateKey) => {
      const url =
        `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${dateKey}&groups=50&limit=500`;
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
      if (!isNcaaTournamentEvent(event)) continue;
      const game = normalizeEspnEvent(event);
      if (!game) continue;
      if (seen.has(game.id)) continue;
      seen.add(game.id);
      out.push(game);
    }
  }

  return out.sort(sortScores);
}

function ScorePanel({
  title,
  games,
  loading,
  error,
  emptyMessage,
  trackedEspnSet,
  trackedKeySet,
  titleAccessory,
}: {
  title: string;
  games: LiveScoreGame[];
  loading: boolean;
  error: string | null;
  emptyMessage: string;
  trackedEspnSet?: Set<string>;
  trackedKeySet?: Set<string>;
  titleAccessory?: ReactNode;
}) {
  const trackedEspn = trackedEspnSet ?? new Set<string>();
  const trackedKeys = trackedKeySet ?? new Set<string>();

  return (
    <aside style={scorePanelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 15 }}>{title}</div>
        {titleAccessory ? <div>{titleAccessory}</div> : null}
      </div>
      {loading ? <div style={{ opacity: 0.8 }}>Loading scores...</div> : null}
      {!loading && error ? <div style={{ opacity: 0.8 }}>{error}</div> : null}
      {!loading && !error && games.length === 0 ? (
        <div style={{ opacity: 0.8 }}>{emptyMessage}</div>
      ) : null}
      {!loading &&
        !error &&
        games.map((game) => {
          const awayTracked = isTrackedTeam(
            game.awayTeamId,
            game.awayTeamName,
            game.awayTeam,
            trackedEspn,
            trackedKeys
          );
          const homeTracked = isTrackedTeam(
            game.homeTeamId,
            game.homeTeamName,
            game.homeTeam,
            trackedEspn,
            trackedKeys
          );
          const gameHasTrackedTeam = awayTracked || homeTracked;

          const row = (
            <article
              style={{
                ...scoreRowStyle,
                border: gameHasTrackedTeam
                  ? "1px solid var(--highlight-border)"
                  : "1px solid var(--border-color)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  border: awayTracked ? "1px solid var(--highlight-border)" : "1px solid transparent",
                  borderRadius: 8,
                  padding: "2px 6px",
                  background: awayTracked ? "var(--highlight)" : "transparent",
                }}
              >
                <span
                  style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}
                  title={game.awayTeamName}
                >
                  {awayTracked ? <span style={{ fontWeight: 900 }}>★</span> : null}
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  border: homeTracked ? "1px solid var(--highlight-border)" : "1px solid transparent",
                  borderRadius: 8,
                  padding: "2px 6px",
                  background: homeTracked ? "var(--highlight)" : "transparent",
                }}
              >
                <span
                  style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}
                  title={game.homeTeamName}
                >
                  {homeTracked ? <span style={{ fontWeight: 900 }}>★</span> : null}
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
              {game.boxScoreUrl ? (
                <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>View box score</div>
              ) : null}
            </article>
          );

          if (!game.boxScoreUrl) return <div key={game.id}>{row}</div>;

          return (
            <a
              key={game.id}
              href={game.boxScoreUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{ textDecoration: "none", color: "inherit" }}
              aria-label={`View box score for ${game.awayTeamName} at ${game.homeTeamName}`}
            >
              {row}
            </a>
          );
        })}
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

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [memberPools, setMemberPools] = useState<PoolOption[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [personalizedLoaded, setPersonalizedLoaded] = useState(false);
  const [trackedEspnIds, setTrackedEspnIds] = useState<string[]>([]);
  const [trackedTeamKeys, setTrackedTeamKeys] = useState<string[]>([]);
  const [trackedTeamCount, setTrackedTeamCount] = useState(0);
  const [showScoringUpdateModal, setShowScoringUpdateModal] = useState(false);
  const [scoreViewMode, setScoreViewMode] = useState<ScoreViewMode>("all-scores");
  const [homeDrafts, setHomeDrafts] = useState<HomeDraftRow[]>([]);
  const [homeDraftsLoading, setHomeDraftsLoading] = useState(false);
  const [homeDraftsMessage, setHomeDraftsMessage] = useState("");
  const [homeDraftPoolsByDraft, setHomeDraftPoolsByDraft] = useState<Record<string, HomeDraftPool[]>>({});
  const [homeDraftPointsByDraft, setHomeDraftPointsByDraft] = useState<Record<string, number>>({});
  const [expandedDraftPools, setExpandedDraftPools] = useState<Record<string, boolean>>({});
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null);
  const homeDraftsLoadedRef = useRef(false);

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

    void loadInvitePoolName();
  }, [invitePoolId]);

  useEffect(() => {
    if (isAuthenticated !== true) {
      setShowScoringUpdateModal(false);
      return;
    }

    try {
      if (window.localStorage.getItem(SCORING_UPDATE_SEEN_KEY) === "1") return;
      setShowScoringUpdateModal(true);
    } catch {
      setShowScoringUpdateModal(true);
    }
  }, [isAuthenticated]);

  const dismissScoringUpdateModal = () => {
    setShowScoringUpdateModal(false);
    try {
      window.localStorage.setItem(SCORING_UPDATE_SEEN_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
  };

  useEffect(() => {
    let canceled = false;

    const resetAuthedHomeState = () => {
      if (canceled) return;
      setIsAuthenticated(false);
      setUserId(null);
      setMemberPools([]);
      setSelectedPoolId("");
      setTrackedEspnIds([]);
      setTrackedTeamKeys([]);
      setTrackedTeamCount(0);
      setHomeDrafts([]);
      setHomeDraftPoolsByDraft({});
      setHomeDraftPointsByDraft({});
      setExpandedDraftPools({});
      setHomeDraftsMessage("");
      setRenamingDraftId(null);
      setHomeDraftsLoading(false);
      homeDraftsLoadedRef.current = false;
      setPersonalizedLoaded(true);
    };

    const loadUserPools = async () => {
      setPersonalizedLoaded(false);

      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;

      if (!user) {
        resetAuthedHomeState();
        return;
      }

      if (!canceled) setIsAuthenticated(true);
      if (!canceled) {
        setUserId(user.id);
      }

      const memberRes = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id);

      if (memberRes.error) {
        if (!canceled) {
          setMemberPools([]);
          setSelectedPoolId("");
          setTrackedEspnIds([]);
          setTrackedTeamKeys([]);
          setTrackedTeamCount(0);
          setPersonalizedLoaded(true);
        }
        return;
      }

      const memberPoolIds = Array.from(
        new Set(((memberRes.data ?? []) as Array<{ pool_id: string }>).map((row) => row.pool_id).filter(Boolean))
      );

      if (memberPoolIds.length === 0) {
        if (!canceled) {
          setMemberPools([]);
          setSelectedPoolId("");
          setTrackedEspnIds([]);
          setTrackedTeamKeys([]);
          setTrackedTeamCount(0);
          setPersonalizedLoaded(true);
        }
        return;
      }

      const poolsRes = await supabase
        .from("pools")
        .select("id,name")
        .in("id", memberPoolIds)
        .order("name", { ascending: true });

      const nextPools = ((poolsRes.data ?? []) as PoolOption[]).sort(sortPoolsByName);

      if (!canceled) {
        setMemberPools(nextPools);
        setSelectedPoolId((prev) => {
          if (prev && nextPools.some((pool) => pool.id === prev)) return prev;
          return nextPools[0]?.id ?? "";
        });
      }
    };

    void loadUserPools();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        resetAuthedHomeState();
        return;
      }

      if (canceled) return;
      setIsAuthenticated(true);
      setUserId(session.user.id);
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void loadUserPools();
      }
    });

    return () => {
      canceled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    const loadPoolTrackedTeams = async () => {
      if (isAuthenticated !== true || !userId) {
        return;
      }

      if (!selectedPoolId) {
        if (!canceled) {
          setTrackedEspnIds([]);
          setTrackedTeamKeys([]);
          setTrackedTeamCount(0);
          setPersonalizedLoaded(true);
        }
        return;
      }

      setPersonalizedLoaded(false);

      const entryRes = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", selectedPoolId)
        .eq("user_id", userId);

      const entryIds = Array.from(
        new Set(((entryRes.data ?? []) as Array<{ id: string }>).map((entry) => entry.id).filter(Boolean))
      );

      if (entryIds.length === 0) {
        if (!canceled) {
          setTrackedEspnIds([]);
          setTrackedTeamKeys([]);
          setTrackedTeamCount(0);
          setPersonalizedLoaded(true);
        }
        return;
      }

      const entryPickRes = await supabase
        .from("entry_picks")
        .select("entry_id,team_id")
        .in("entry_id", entryIds);

      const teamIds = ((entryPickRes.data ?? []) as Array<{ entry_id: string; team_id: string }>)
        .map((row) => row.team_id)
        .filter(Boolean);

      const uniqueTeamIds = Array.from(new Set(teamIds));
      if (uniqueTeamIds.length === 0) {
        if (!canceled) {
          setTrackedEspnIds([]);
          setTrackedTeamKeys([]);
          setTrackedTeamCount(0);
          setPersonalizedLoaded(true);
        }
        return;
      }

      let teamRows: TeamLookupRow[] = [];
      const withEspnRes = await supabase
        .from("teams")
        .select("id,name,espn_team_id")
        .in("id", uniqueTeamIds);

      if (!withEspnRes.error) {
        teamRows = (withEspnRes.data ?? []) as TeamLookupRow[];
      } else if (withEspnRes.error.message.includes("espn_team_id")) {
        const fallbackRes = await supabase
          .from("teams")
          .select("id,name")
          .in("id", uniqueTeamIds);

        if (!fallbackRes.error) {
          teamRows = (fallbackRes.data ?? []) as TeamLookupRow[];
        }
      }

      const espnSet = new Set<string>();
      const keySet = new Set<string>();
      for (const row of teamRows) {
        if (row.espn_team_id != null) espnSet.add(String(row.espn_team_id));
        for (const variant of teamNameVariants(row.name ?? "")) {
          if (variant) keySet.add(variant);
        }
      }

      if (!canceled) {
        setTrackedEspnIds(Array.from(espnSet));
        setTrackedTeamKeys(Array.from(keySet));
        setTrackedTeamCount(uniqueTeamIds.length);
        setPersonalizedLoaded(true);
      }
    };

    void loadPoolTrackedTeams();

    return () => {
      canceled = true;
    };
  }, [isAuthenticated, selectedPoolId, userId]);

  useEffect(() => {
    let canceled = false;

    const resetDraftCenter = () => {
      if (canceled) return;
      setHomeDrafts([]);
      setHomeDraftPoolsByDraft({});
      setHomeDraftPointsByDraft({});
      setExpandedDraftPools({});
      setHomeDraftsLoading(false);
      setHomeDraftsMessage("");
      setRenamingDraftId(null);
      homeDraftsLoadedRef.current = false;
    };

    const loadHomeDrafts = async () => {
      if (isAuthenticated !== true || !userId) {
        resetDraftCenter();
        return;
      }

      const shouldShowLoadingState = !homeDraftsLoadedRef.current;
      if (shouldShowLoadingState) {
        setHomeDraftsLoading(true);
      }
      setHomeDraftsMessage("");

      const draftRes = await supabase
        .from("saved_drafts")
        .select("id,name,created_at,updated_at,user_id")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (draftRes.error) {
        if (!canceled) {
          if (isMissingSavedDraftTablesError(draftRes.error.message)) {
            setHomeDraftsMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
          } else {
            setHomeDraftsMessage(draftRes.error.message);
          }
          setHomeDrafts([]);
          setHomeDraftPoolsByDraft({});
          setHomeDraftPointsByDraft({});
          setExpandedDraftPools({});
          setHomeDraftsLoading(false);
          homeDraftsLoadedRef.current = true;
        }
        return;
      }

      const nextDrafts = ((draftRes.data ?? []) as SavedDraftRow[])
        .map((draft) => ({
          id: draft.id,
          name: draft.name,
          created_at: draft.created_at,
          updated_at: draft.updated_at,
        }))
        .sort(sortDraftsByUpdatedAt);

      if (canceled) return;
      setHomeDrafts(nextDrafts);
      setExpandedDraftPools((prev) => {
        const next: Record<string, boolean> = {};
        for (const draft of nextDrafts) {
          if (prev[draft.id]) next[draft.id] = true;
        }
        return next;
      });

      if (nextDrafts.length === 0) {
        if (!canceled) {
          setHomeDraftPoolsByDraft({});
          setHomeDraftPointsByDraft({});
          setHomeDraftsLoading(false);
          homeDraftsLoadedRef.current = true;
        }
        return;
      }

      const draftIds = nextDrafts.map((draft) => draft.id);
      const draftPickRes = await supabase
        .from("saved_draft_picks")
        .select("draft_id,team_id")
        .in("draft_id", draftIds);

      if (draftPickRes.error) {
        if (!canceled) {
          if (isMissingSavedDraftTablesError(draftPickRes.error.message)) {
            setHomeDraftsMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
          } else {
            setHomeDraftsMessage(draftPickRes.error.message);
          }
          setHomeDraftPoolsByDraft({});
          setHomeDraftPointsByDraft({});
          setHomeDraftsLoading(false);
          homeDraftsLoadedRef.current = true;
        }
        return;
      }

      const draftPicksByDraft = new Map<string, Set<string>>();
      for (const draftId of draftIds) {
        draftPicksByDraft.set(draftId, new Set<string>());
      }
      for (const row of (draftPickRes.data ?? []) as DraftPickRow[]) {
        const picks = draftPicksByDraft.get(row.draft_id) ?? new Set<string>();
        picks.add(row.team_id);
        draftPicksByDraft.set(row.draft_id, picks);
      }

      const draftPoolsRecord: Record<string, HomeDraftPool[]> = {};
      const draftPointsRecord: Record<string, number> = {};
      for (const draft of nextDrafts) {
        draftPoolsRecord[draft.id] = [];
        draftPointsRecord[draft.id] = 0;
      }

      const entryWithNameRes = await supabase
        .from("entries")
        .select("id,pool_id,entry_name")
        .eq("user_id", userId);

      let entryRows: DraftPoolEntryRow[] = [];
      if (!entryWithNameRes.error) {
        entryRows = (entryWithNameRes.data ?? []) as DraftPoolEntryRow[];
      } else if (isMissingEntryNameError(entryWithNameRes.error.message)) {
        const entryFallbackRes = await supabase
          .from("entries")
          .select("id,pool_id")
          .eq("user_id", userId);

        if (entryFallbackRes.error) {
          if (!canceled) {
            setHomeDraftsMessage(entryFallbackRes.error.message);
              setHomeDraftPoolsByDraft(draftPoolsRecord);
              setHomeDraftPointsByDraft(draftPointsRecord);
              setHomeDraftsLoading(false);
              homeDraftsLoadedRef.current = true;
            }
            return;
          }

        entryRows = ((entryFallbackRes.data ?? []) as Array<{ id: string; pool_id: string }>).map((entry) => ({
          ...entry,
          entry_name: null,
        }));
      } else {
        if (!canceled) {
          setHomeDraftsMessage(entryWithNameRes.error.message);
          setHomeDraftPoolsByDraft(draftPoolsRecord);
          setHomeDraftPointsByDraft(draftPointsRecord);
          setHomeDraftsLoading(false);
          homeDraftsLoadedRef.current = true;
        }
        return;
      }

      const entryIds = entryRows.map((entry) => entry.id);
      const poolIds = Array.from(new Set(entryRows.map((entry) => entry.pool_id).filter(Boolean)));
      const entryIdSet = new Set(entryIds);
      const scoreByEntryId = new Map<string, number>();
      const placeByPoolAndEntry = new Map<string, number>();

      const poolsById = new Map<string, PoolOption>();
      if (poolIds.length > 0) {
        const poolsRes = await supabase
          .from("pools")
          .select("id,name")
          .in("id", poolIds);

        if (poolsRes.error) {
          if (!canceled) {
            setHomeDraftsMessage(poolsRes.error.message);
            setHomeDraftPoolsByDraft(draftPoolsRecord);
            setHomeDraftPointsByDraft(draftPointsRecord);
            setHomeDraftsLoading(false);
            homeDraftsLoadedRef.current = true;
          }
          return;
        }

        for (const pool of (poolsRes.data ?? []) as PoolOption[]) {
          poolsById.set(pool.id, pool);
        }
      }

      if (entryIds.length > 0) {
        if (poolIds.length > 0) {
          const leaderboardRes = await supabase
            .from("pool_leaderboard")
            .select("entry_id,pool_id,total_score")
            .in("pool_id", poolIds);

          if (!leaderboardRes.error) {
            const rows = (leaderboardRes.data ?? []) as DraftPoolLeaderboardRow[];
            const rowsByPool = new Map<string, DraftPoolLeaderboardRow[]>();
            for (const row of rows) {
              const list = rowsByPool.get(row.pool_id) ?? [];
              list.push(row);
              rowsByPool.set(row.pool_id, list);
              if (entryIdSet.has(row.entry_id)) {
                scoreByEntryId.set(row.entry_id, Number(row.total_score ?? 0));
              }
            }

            for (const [poolId, poolRows] of rowsByPool.entries()) {
              const sortedRows = poolRows
                .map((row) => ({ entry_id: row.entry_id, score: Number(row.total_score ?? 0) }))
                .sort((a, b) => {
                  if (b.score !== a.score) return b.score - a.score;
                  return a.entry_id.localeCompare(b.entry_id);
                });

              let rank = 0;
              let previousScore: number | null = null;
              for (let i = 0; i < sortedRows.length; i += 1) {
                const row = sortedRows[i];
                if (previousScore === null || row.score < previousScore) {
                  rank = i + 1;
                  previousScore = row.score;
                }
                placeByPoolAndEntry.set(`${poolId}:${row.entry_id}`, rank);
              }
            }
          }
        }

        const entryPickRes = await supabase
          .from("entry_picks")
          .select("entry_id,team_id")
          .in("entry_id", entryIds);

        if (entryPickRes.error) {
          if (!canceled) {
            setHomeDraftsMessage(entryPickRes.error.message);
            setHomeDraftPoolsByDraft(draftPoolsRecord);
            setHomeDraftPointsByDraft(draftPointsRecord);
            setHomeDraftsLoading(false);
            homeDraftsLoadedRef.current = true;
          }
          return;
        }

        const entryPicksByEntry = new Map<string, Set<string>>();
        for (const entryId of entryIds) {
          entryPicksByEntry.set(entryId, new Set<string>());
        }
        for (const row of (entryPickRes.data ?? []) as DraftPoolEntryPickRow[]) {
          const picks = entryPicksByEntry.get(row.entry_id) ?? new Set<string>();
          picks.add(row.team_id);
          entryPicksByEntry.set(row.entry_id, picks);
        }

        const matchedEntryIdsByDraft = new Map<string, Set<string>>();
        for (const draft of nextDrafts) {
          matchedEntryIdsByDraft.set(draft.id, new Set<string>());
        }

        const draftIdsByName = new Map<string, string[]>();
        for (const draft of nextDrafts) {
          const key = normalizeDraftName(draft.name);
          if (!key) continue;
          const list = draftIdsByName.get(key) ?? [];
          list.push(draft.id);
          draftIdsByName.set(key, list);
        }

        for (const entry of entryRows) {
          const entryNameKey = normalizeDraftName(entry.entry_name);
          if (!entryNameKey) continue;
          const matchingDraftIds = draftIdsByName.get(entryNameKey);
          if (!matchingDraftIds || matchingDraftIds.length === 0) continue;
          for (const draftId of matchingDraftIds) {
            matchedEntryIdsByDraft.get(draftId)?.add(entry.id);
          }
        }

        for (const draft of nextDrafts) {
          const draftPicks = draftPicksByDraft.get(draft.id) ?? new Set<string>();
          if (draftPicks.size === 0) continue;

          for (const entry of entryRows) {
            const entryPicks = entryPicksByEntry.get(entry.id);
            if (!entryPicks || entryPicks.size === 0) continue;
            if (!sameTeamSet(draftPicks, entryPicks)) continue;
            matchedEntryIdsByDraft.get(draft.id)?.add(entry.id);
          }
        }

        const matchedEntryIds = new Set<string>();
        for (const matchedIds of matchedEntryIdsByDraft.values()) {
          for (const entryId of matchedIds) matchedEntryIds.add(entryId);
        }

        // Fallback for older schemas (no entry_name) or when a draft changed
        // after entering a pool: match the closest draft by team overlap.
        for (const entry of entryRows) {
          if (matchedEntryIds.has(entry.id)) continue;
          const entryPicks = entryPicksByEntry.get(entry.id);
          if (!entryPicks || entryPicks.size === 0) continue;

          let bestDraftId: string | null = null;
          let bestOverlap = 0;
          let bestEntryShare = 0;
          let bestUpdatedAt = Number.NEGATIVE_INFINITY;

          for (const draft of nextDrafts) {
            const draftPicks = draftPicksByDraft.get(draft.id);
            if (!draftPicks || draftPicks.size === 0) continue;

            const overlap = overlapCount(draftPicks, entryPicks);
            if (overlap === 0) continue;

            const entryShare = overlap / entryPicks.size;
            const updatedAt = Date.parse(draft.updated_at);

            const isBetter =
              overlap > bestOverlap ||
              (overlap === bestOverlap && entryShare > bestEntryShare) ||
              (overlap === bestOverlap &&
                entryShare === bestEntryShare &&
                updatedAt > bestUpdatedAt);

            if (isBetter) {
              bestDraftId = draft.id;
              bestOverlap = overlap;
              bestEntryShare = entryShare;
              bestUpdatedAt = Number.isFinite(updatedAt) ? updatedAt : Number.NEGATIVE_INFINITY;
            }
          }

          if (!bestDraftId) continue;

          const minimumOverlap = Math.min(3, entryPicks.size);
          if (bestOverlap < minimumOverlap) continue;
          if (bestEntryShare < 0.6) continue;

          matchedEntryIdsByDraft.get(bestDraftId)?.add(entry.id);
          matchedEntryIds.add(entry.id);
        }

        const entryById = new Map(entryRows.map((entry) => [entry.id, entry]));
        for (const draft of nextDrafts) {
          const matchedEntries = Array.from(matchedEntryIdsByDraft.get(draft.id) ?? []);
          const matchedPoolsById = new Map<
            string,
            HomeDraftPool & {
              bestPoints: number;
            }
          >();
          let totalPoints = 0;

          for (const entryId of matchedEntries) {
            const entry = entryById.get(entryId);
            if (!entry) continue;
            const points = scoreByEntryId.get(entryId) ?? 0;
            totalPoints += points;

            const pool = poolsById.get(entry.pool_id);
            if (!pool) continue;

            const place = placeByPoolAndEntry.get(`${entry.pool_id}:${entryId}`) ?? null;
            const existing = matchedPoolsById.get(entry.pool_id);
            if (!existing || points > existing.bestPoints) {
              matchedPoolsById.set(entry.pool_id, {
                id: pool.id,
                name: pool.name,
                place,
                bestPoints: points,
              });
            }
          }

          const poolList = Array.from(matchedPoolsById.values())
            .map(({ id, name, place }) => ({ id, name, place }))
            .sort(sortPoolsByName);
          draftPoolsRecord[draft.id] = poolList;
          draftPointsRecord[draft.id] = totalPoints;
        }
      }

      if (!canceled) {
        setHomeDraftPoolsByDraft(draftPoolsRecord);
        setHomeDraftPointsByDraft(draftPointsRecord);
        setHomeDraftsLoading(false);
        homeDraftsLoadedRef.current = true;
      }
    };

    void loadHomeDrafts();

    return () => {
      canceled = true;
    };
  }, [isAuthenticated, userId]);

  useEffect(() => {
    let canceled = false;

    const loadScores = async () => {
      try {
        const lookbackDays = LANDING_LOOKBACK_DAYS;
        const lookaheadDays = LANDING_LOOKAHEAD_DAYS;
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

    void loadScores();
    const interval = window.setInterval(loadScores, 45_000);

    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, []);

  const trackedEspnSet = useMemo(() => new Set(trackedEspnIds), [trackedEspnIds]);
  const trackedKeySet = useMemo(() => new Set(trackedTeamKeys), [trackedTeamKeys]);
  const selectedPoolName = useMemo(
    () => memberPools.find((pool) => pool.id === selectedPoolId)?.name ?? null,
    [memberPools, selectedPoolId]
  );

  const todayEt = useMemo(() => etDayKey(new Date()), []);
  const yesterdayEt = useMemo(() => etDayKey(shiftDate(-1)), []);
  const tomorrowEt = useMemo(() => etDayKey(shiftDate(1)), []);

  const todayFinals = useMemo(
    () =>
      scores.filter((g) => {
        if (g.state !== "FINAL") return false;
        const gameDay = etDayKeyFromIso(g.startTime);
        return gameDay === todayEt;
      }),
    [scores, todayEt]
  );
  const yesterdayFinals = useMemo(
    () =>
      scores.filter((g) => {
        if (g.state !== "FINAL") return false;
        const gameDay = etDayKeyFromIso(g.startTime);
        return gameDay === yesterdayEt;
      }),
    [scores, yesterdayEt]
  );
  const recentFinals = useMemo(
    () => (todayFinals.length > 0 ? todayFinals : yesterdayFinals),
    [todayFinals, yesterdayFinals]
  );

  const todayLiveAndUpcoming = useMemo(
    () =>
      scores.filter((g) => {
        if (g.state === "FINAL") return false;
        const gameDay = etDayKeyFromIso(g.startTime);
        return gameDay === todayEt;
      }),
    [scores, todayEt]
  );
  const tomorrowLiveAndUpcoming = useMemo(
    () =>
      scores.filter((g) => {
        if (g.state === "FINAL") return false;
        const gameDay = etDayKeyFromIso(g.startTime);
        return gameDay === tomorrowEt;
      }),
    [scores, tomorrowEt]
  );
  const liveAndUpcoming = useMemo(
    () => (todayLiveAndUpcoming.length > 0 ? todayLiveAndUpcoming : tomorrowLiveAndUpcoming),
    [todayLiveAndUpcoming, tomorrowLiveAndUpcoming]
  );

  const shouldFilterToMyTeams =
    isAuthenticated === true && scoreViewMode === "my-teams";
  const displayedRecentFinals = useMemo(() => {
    if (!shouldFilterToMyTeams) return recentFinals;
    return recentFinals.filter((game) => gameHasTrackedTeam(game, trackedEspnSet, trackedKeySet));
  }, [recentFinals, shouldFilterToMyTeams, trackedEspnSet, trackedKeySet]);
  const displayedLiveAndUpcoming = useMemo(() => {
    if (!shouldFilterToMyTeams) return liveAndUpcoming;
    return liveAndUpcoming.filter((game) => gameHasTrackedTeam(game, trackedEspnSet, trackedKeySet));
  }, [liveAndUpcoming, shouldFilterToMyTeams, trackedEspnSet, trackedKeySet]);

  const recentFinalsEmptyMessage = shouldFilterToMyTeams
    ? "No final scores for your teams from today or yesterday."
    : "No final scores from today or yesterday.";
  const liveAndUpcomingEmptyMessage = shouldFilterToMyTeams
    ? "No live or upcoming games for your teams today or tomorrow."
    : "No live or upcoming games for today or tomorrow.";
  const renderScoreViewToggle = () => (
    <div
      role="group"
      aria-label="Score view mode"
      style={{
        display: "inline-flex",
        border: "1px solid var(--border-color)",
        borderRadius: 999,
        padding: 2,
        background: "var(--surface-muted)",
      }}
    >
      <button
        type="button"
        onClick={() => setScoreViewMode("my-teams")}
        aria-pressed={scoreViewMode === "my-teams"}
        style={{
          border: "none",
          borderRadius: 999,
          padding: "4px 10px",
          fontWeight: 800,
          cursor: "pointer",
          background:
            scoreViewMode === "my-teams" ? "var(--surface)" : "transparent",
          color: "inherit",
          fontSize: 12,
        }}
      >
        My Teams
      </button>
      <button
        type="button"
        onClick={() => setScoreViewMode("all-scores")}
        aria-pressed={scoreViewMode === "all-scores"}
        style={{
          border: "none",
          borderRadius: 999,
          padding: "4px 10px",
          fontWeight: 800,
          cursor: "pointer",
          background:
            scoreViewMode === "all-scores" ? "var(--surface)" : "transparent",
          color: "inherit",
          fontSize: 12,
        }}
      >
        All Scores
      </button>
    </div>
  );
  const homeDraftCountLabel = `${homeDrafts.length}/${MAX_HOME_DRAFTS} drafts created`;

  const toggleDraftPools = (draftId: string) => {
    setExpandedDraftPools((prev) => ({ ...prev, [draftId]: !prev[draftId] }));
  };

  const renameHomeDraft = async (draft: HomeDraftRow) => {
    if (!userId) {
      setHomeDraftsMessage("Please log in to rename drafts.");
      return;
    }

    const nextInput = window.prompt("Rename draft", draft.name)?.trim();
    if (!nextInput) return;
    const nextName = nextInput.slice(0, 80);
    if (nextName === draft.name.trim()) return;

    setRenamingDraftId(draft.id);
    setHomeDraftsMessage("");

    const { data, error } = await supabase
      .from("saved_drafts")
      .update({ name: nextName })
      .eq("id", draft.id)
      .eq("user_id", userId)
      .select("id,name,created_at,updated_at")
      .single();

    if (error) {
      setRenamingDraftId(null);
      setHomeDraftsMessage(error.message);
      return;
    }

    const updated = data as HomeDraftRow;
    setHomeDrafts((prev) =>
      prev
        .map((row) =>
          row.id === updated.id
            ? {
                ...row,
                name: updated.name,
                updated_at: updated.updated_at,
              }
            : row
        )
        .sort(sortDraftsByUpdatedAt)
    );
    setRenamingDraftId(null);
  };

  return (
    <main
      style={{
        maxWidth: 1240,
        margin: "40px auto",
        padding: 16,
      }}
    >
      <div
        style={{
          marginBottom: 16,
          display: "grid",
          gap: 10,
        }}
      >
        {isAuthenticated ? (
          <div
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>
              {scoreViewMode === "my-teams"
                ? "Showing your selected teams from"
                : "Highlighting your teams from"}
            </span>
            <select
              id="home-pool-selector"
              value={selectedPoolId}
              onChange={(event) => setSelectedPoolId(event.target.value)}
              disabled={memberPools.length === 0}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
                fontWeight: 700,
                minHeight: 38,
              }}
            >
              {memberPools.length === 0 ? (
                <option value="">no joined pools</option>
              ) : (
                memberPools.map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name}
                  </option>
                ))
              )}
            </select>
            <span>.</span>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/how-it-works"
              style={buttonStyle}
              onClick={() =>
                trackEvent({
                  eventName: "home_cta_click",
                  metadata: { cta: "how_it_works", has_invite: Boolean(invitePoolId), logged_in: Boolean(isAuthenticated) },
                })
              }
            >
              How it works
            </Link>
            {isAuthenticated === false ? (
              <Link
                href={loginHref}
                style={buttonStyle}
                onClick={() =>
                  trackEvent({
                    eventName: "home_cta_click",
                    metadata: { cta: "login_signup", has_invite: Boolean(invitePoolId), logged_in: false },
                  })
                }
              >
                Login / Sign up
              </Link>
            ) : null}
          </div>
        )}

        {isAuthenticated === true && memberPools.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14, opacity: 0.82 }}>
            Join a pool to highlight your drafted teams on the scoreboard.
          </p>
        ) : null}

        {isAuthenticated === true && selectedPoolName && personalizedLoaded && trackedTeamCount === 0 ? (
          <p style={{ margin: 0, fontSize: 14, opacity: 0.82 }}>
            You have no drafted teams applied in <b>{selectedPoolName}</b> yet.
          </p>
        ) : null}

        {invitePoolId ? (
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            You are being invited to join <b>{invitePoolName ?? "this pool"}</b>.
          </p>
        ) : null}
      </div>

      <div className="home-layout">
        <div className="home-scores-left">
          <ScorePanel
            title="Recent Finals"
            games={displayedRecentFinals}
            loading={scoresLoading}
            error={scoresError}
            emptyMessage={recentFinalsEmptyMessage}
            trackedEspnSet={trackedEspnSet}
            trackedKeySet={trackedKeySet}
            titleAccessory={isAuthenticated ? renderScoreViewToggle() : undefined}
          />
        </div>

        <section
          className="home-center"
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 12,
            alignContent: "start",
            minHeight: 360,
          }}
          aria-label="My drafts"
        >
          <div style={{ display: "grid", gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>My Drafts</h2>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.82 }}>{homeDraftCountLabel}</p>
          </div>

          {isAuthenticated !== true ? (
            <p style={{ margin: 0, opacity: 0.82 }}>Log in to view your saved drafts.</p>
          ) : null}

          {isAuthenticated === true && homeDraftsLoading && homeDrafts.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.82 }}>Loading drafts...</p>
          ) : null}

          {isAuthenticated === true && !homeDraftsLoading && homeDrafts.length === 0 ? (
            <p style={{ margin: 0, opacity: 0.82 }}>No drafts found.</p>
          ) : null}

          {isAuthenticated === true && !homeDraftsLoading && homeDrafts.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {homeDrafts.map((draft) => {
                const pools = homeDraftPoolsByDraft[draft.id] ?? [];
                const currentPoints = homeDraftPointsByDraft[draft.id] ?? 0;
                const expanded = Boolean(expandedDraftPools[draft.id]);

                return (
                  <article
                    key={draft.id}
                    style={{
                      border: "1px solid var(--border-color)",
                      borderRadius: 12,
                      background: "var(--surface)",
                      padding: 12,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                        <Link
                          href={`/drafts/${draft.id}`}
                          className="home-draft-link"
                          style={{
                            color: "inherit",
                            textDecoration: "none",
                            fontWeight: 900,
                            fontSize: 18,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={`View ${draft.name}`}
                        >
                          {draft.name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => void renameHomeDraft(draft)}
                          disabled={renamingDraftId === draft.id}
                          aria-label={`Rename ${draft.name}`}
                          title={renamingDraftId === draft.id ? "Renaming..." : `Rename ${draft.name}`}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            border: "1px solid var(--border-color)",
                            background: "var(--surface)",
                            cursor: renamingDraftId === draft.id ? "not-allowed" : "pointer",
                            opacity: renamingDraftId === draft.id ? 0.7 : 1,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <PenIcon />
                        </button>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, whiteSpace: "nowrap" }}>
                        {currentPoints} pts
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>Pools: ({pools.length})</div>
                      <button
                        type="button"
                        onClick={() => toggleDraftPools(draft.id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "inherit",
                          fontWeight: 400,
                          fontSize: 13,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {expanded ? "Hide Pools ^" : "Show Pools v"}
                      </button>
                    </div>

                    {expanded ? (
                      <div
                        style={{
                          borderTop: "1px solid var(--border-color)",
                          paddingTop: 10,
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        {pools.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>This draft is not in any pools yet.</p>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {pools.map((pool) => (
                              <Link
                                key={pool.id}
                                href="/pools"
                                style={{
                                  color: "inherit",
                                  textDecoration: "none",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: 8,
                                  background: "var(--surface-muted)",
                                  padding: "6px 8px",
                                  display: "inline-flex",
                                  flexDirection: "column",
                                  alignItems: "flex-start",
                                  gap: 2,
                                  width: "fit-content",
                                }}
                                title={`View ${pool.name}`}
                              >
                                <span style={{ fontWeight: 700, lineHeight: 1.1 }}>{pool.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.82, lineHeight: 1.1 }}>
                                  {formatPlace(pool.place)}
                                </span>
                              </Link>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link
                            href="/pools/new"
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--border-color)",
                              textDecoration: "none",
                              fontWeight: 800,
                              background: "var(--surface)",
                            }}
                          >
                            Create Pool
                          </Link>
                          <Link
                            href="/pools"
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--border-color)",
                              textDecoration: "none",
                              fontWeight: 800,
                              background: "var(--surface)",
                            }}
                          >
                            Join Pool(s)
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : null}

          {homeDraftsMessage ? (
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
              {homeDraftsMessage}
            </p>
          ) : null}
        </section>

        <div className="home-scores-right">
          <ScorePanel
            title="Live / Upcoming"
            games={displayedLiveAndUpcoming}
            loading={scoresLoading}
            error={scoresError}
            emptyMessage={liveAndUpcomingEmptyMessage}
            trackedEspnSet={trackedEspnSet}
            trackedKeySet={trackedKeySet}
            titleAccessory={isAuthenticated ? renderScoreViewToggle() : undefined}
          />
        </div>
      </div>

      {showScoringUpdateModal ? (
        <div
          role="presentation"
          onClick={dismissScoringUpdateModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 120,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Scoring update"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px, 100%)",
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
              Scoring Update
            </h2>
            <p style={{ margin: 0, lineHeight: 1.5 }}>
              We added one scoring rule: <b>Perfect Round of 64 Bonus</b>. If all
              of your drafted teams win in the Round of 64, you earn bonus points
              equal to the sum of your teams&apos; seeds.
            </p>
            <p style={{ margin: 0, opacity: 0.85 }}>
              Want to read the full scoring details?
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={dismissScoringUpdateModal}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Not now
              </button>
              <Link
                href="/how-it-works"
                onClick={dismissScoringUpdateModal}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "var(--surface-elevated)",
                }}
              >
                Read Scoring Rules
              </Link>
            </div>
          </div>
        </div>
      ) : null}
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
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/how-it-works"
          style={buttonStyle}
          onClick={() =>
            trackEvent({
              eventName: "home_cta_click",
              metadata: { cta: "how_it_works", has_invite: false },
            })
          }
        >
          How it works
        </Link>
        <Link
          href="/login"
          style={buttonStyle}
          onClick={() =>
            trackEvent({
              eventName: "home_cta_click",
              metadata: { cta: "login_signup", has_invite: false },
            })
          }
        >
          Login / Sign up
        </Link>
      </div>

      <div className="home-layout">
        <div className="home-scores-left">
          <ScorePanel
            title="Recent Finals"
            games={[]}
            loading
            error={null}
            emptyMessage="No final scores from today or yesterday."
          />
        </div>

        <section
          className="home-center"
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 10,
            alignContent: "start",
            minHeight: 360,
          }}
          aria-label="My drafts"
        >
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>My Drafts</h2>
          <p style={{ margin: 0, fontSize: 14, opacity: 0.82 }}>0/{MAX_HOME_DRAFTS} drafts created</p>
          <p style={{ margin: 0, opacity: 0.82 }}>Loading drafts...</p>
        </section>

        <div className="home-scores-right">
          <ScorePanel
            title="Live / Upcoming"
            games={[]}
            loading
            error={null}
            emptyMessage="No live or upcoming games for today or tomorrow."
          />
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

