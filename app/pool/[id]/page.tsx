"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";
import { trackEvent } from "@/lib/analytics";
import { isMissingSavedDraftTablesError, sameTeamSet, type SavedDraftPickRow } from "@/lib/savedDrafts";

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

type DraftRow = {
  id: string;
  name: string;
  updated_at: string;
};

type LeaveEntryRow = {
  id: string;
  entry_name: string | null;
};

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

function sortDraftsByUpdatedAt(a: DraftRow, b: DraftRow) {
  return Date.parse(b.updated_at) - Date.parse(a.updated_at);
}

function isMissingEntryNameError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.entry_name does not exist") ||
    message.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
  );
}

function isSingleEntryPerPoolConstraintError(message?: string) {
  if (!message) return false;
  const lowered = message.toLowerCase();
  return (
    lowered.includes("entries_pool_id_user_id_key") ||
    (lowered.includes("duplicate key") &&
      lowered.includes("pool_id") &&
      lowered.includes("user_id"))
  );
}

function leaveEntryLabel(entry: LeaveEntryRow, index: number) {
  const trimmed = entry.entry_name?.trim() ?? "";
  if (trimmed.length > 0) return trimmed;
  return `Entry ${index + 1}`;
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

function isNcaaTournamentEvent(event: EspnEvent) {
  const comp = event.competitions?.[0];
  if (!comp) return false;

  const tournamentId = Number(comp.tournamentId);
  if (Number.isFinite(tournamentId) && tournamentId === 22) return true;

  const notesText = (comp.notes ?? [])
    .map((n) => n.headline ?? "")
    .join(" ")
    .toLowerCase();
  if (notesText.includes("men's basketball championship")) return true;
  if (notesText.includes("mens basketball championship")) return true;
  if (notesText.includes("ncaa tournament")) return true;

  const headlineText = (comp.headlines ?? [])
    .map((h) => `${h.shortLinkText ?? ""} ${h.description ?? ""}`)
    .join(" ")
    .toLowerCase();
  if (headlineText.includes("men's basketball championship")) return true;
  if (headlineText.includes("mens basketball championship")) return true;
  if (headlineText.includes("ncaa tournament")) return true;

  const eventText = `${event.name ?? ""} ${event.shortName ?? ""}`.toLowerCase();
  if (eventText.includes("ncaa tournament")) return true;

  return false;
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

  const eventId = event.id?.trim() || null;
  const boxScoreUrl = eventId && /^\d+$/.test(eventId)
    ? `https://www.espn.com/mens-college-basketball/boxscore/_/gameId/${eventId}`
    : null;

  return {
    id: eventId ?? `${event.date ?? "game"}-${awayLabel}-${homeLabel}`,
    boxScoreUrl,
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

async function fetchEspnDirectScores(lookbackDays: number, lookaheadDays: number): Promise<LiveScoreGame[]> {
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
        games.map((game) => {
          const row = (
            <article
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
  const [reloadKey, setReloadKey] = useState(0);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [joinPassword, setJoinPassword] = useState("");
  const [joining, setJoining] = useState(false);
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [draftModalLoading, setDraftModalLoading] = useState(false);
  const [draftModalSubmitting, setDraftModalSubmitting] = useState(false);
  const [draftModalMessage, setDraftModalMessage] = useState("");
  const [availableDrafts, setAvailableDrafts] = useState<DraftRow[]>([]);
  const [draftPickMap, setDraftPickMap] = useState<Map<string, Set<string>>>(new Map());
  const [alreadyEnteredDraftIds, setAlreadyEnteredDraftIds] = useState<Set<string>>(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveModalLoading, setLeaveModalLoading] = useState(false);
  const [leaveModalSubmitting, setLeaveModalSubmitting] = useState(false);
  const [leaveModalMessage, setLeaveModalMessage] = useState("");
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntryRow[]>([]);
  const [selectedLeaveEntryIds, setSelectedLeaveEntryIds] = useState<Set<string>>(new Set());
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
        .eq("user_id", user.id);

      const entryIds = Array.from(
        new Set(((entryRows ?? []) as Array<{ id: string }>).map((row) => row.id).filter(Boolean))
      );

      if (entryIds.length === 0) {
        setDraftedEspnIds([]);
        setDraftedTeamKeys([]);
        setDraftedTeamCount(0);
        setDraftedLoaded(true);
        setLoading(false);
        return;
      }

      const { data: pickRows } = await supabase
        .from("entry_picks")
        .select("entry_id,team_id")
        .in("entry_id", entryIds);

      const pickedTeamIds = Array.from(
        new Set(((pickRows ?? []) as Array<{ entry_id: string; team_id: string }>).map((p) => p.team_id).filter(Boolean))
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
  }, [poolId, reloadKey]);

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

  const poolIsPrivate = (pool?.is_private ?? true) !== false;
  const selectedDraftCount = selectedDraftIds.size;
  const selectedLeaveCount = selectedLeaveEntryIds.size;

  function closeDraftModal() {
    if (draftModalSubmitting) return;
    setDraftModalOpen(false);
    setDraftModalLoading(false);
    setDraftModalSubmitting(false);
    setDraftModalMessage("");
    setAvailableDrafts([]);
    setDraftPickMap(new Map());
    setAlreadyEnteredDraftIds(new Set());
    setSelectedDraftIds(new Set());
  }

  async function openDraftModal() {
    setDraftModalOpen(true);
    setDraftModalLoading(true);
    setDraftModalSubmitting(false);
    setDraftModalMessage("");
    setAvailableDrafts([]);
    setDraftPickMap(new Map());
    setAlreadyEnteredDraftIds(new Set());
    setSelectedDraftIds(new Set());

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setDraftModalLoading(false);
      setDraftModalMessage("Please log in first.");
      return;
    }

    const draftsQuery = await supabase
      .from("saved_drafts")
      .select("id,name,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (draftsQuery.error) {
      setDraftModalLoading(false);
      if (isMissingSavedDraftTablesError(draftsQuery.error.message)) {
        setDraftModalMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
        return;
      }
      setDraftModalMessage(draftsQuery.error.message);
      return;
    }

    const drafts = ((draftsQuery.data ?? []) as DraftRow[]).sort(sortDraftsByUpdatedAt);
    setAvailableDrafts(drafts);

    if (drafts.length === 0) {
      setDraftModalLoading(false);
      setDraftModalMessage("No saved drafts yet. Create one first.");
      return;
    }

    const draftIds = drafts.map((draft) => draft.id);
    const picksQuery = await supabase
      .from("saved_draft_picks")
      .select("draft_id,team_id")
      .in("draft_id", draftIds);

    if (picksQuery.error) {
      setDraftModalLoading(false);
      if (isMissingSavedDraftTablesError(picksQuery.error.message)) {
        setDraftModalMessage("Saved drafts are not migrated yet. Run db/migrations/20260316_saved_drafts.sql.");
        return;
      }
      setDraftModalMessage(picksQuery.error.message);
      return;
    }

    const nextPickMap = new Map<string, Set<string>>();
    for (const draftId of draftIds) {
      nextPickMap.set(draftId, new Set());
    }
    for (const row of (picksQuery.data ?? []) as SavedDraftPickRow[]) {
      const picks = nextPickMap.get(row.draft_id) ?? new Set<string>();
      picks.add(row.team_id);
      nextPickMap.set(row.draft_id, picks);
    }

    const entryRowsQuery = await supabase
      .from("entries")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", user.id);

    if (entryRowsQuery.error) {
      setDraftModalLoading(false);
      setDraftModalMessage(entryRowsQuery.error.message);
      return;
    }

    const entryIds = ((entryRowsQuery.data ?? []) as Array<{ id: string }>).map((row) => row.id);
    const entryPickMap = new Map<string, Set<string>>();
    if (entryIds.length > 0) {
      const entryPicksQuery = await supabase
        .from("entry_picks")
        .select("entry_id,team_id")
        .in("entry_id", entryIds);

      if (entryPicksQuery.error) {
        setDraftModalLoading(false);
        setDraftModalMessage(entryPicksQuery.error.message);
        return;
      }

      for (const entryId of entryIds) entryPickMap.set(entryId, new Set());
      for (const row of (entryPicksQuery.data ?? []) as Array<{ entry_id: string; team_id: string }>) {
        const picks = entryPickMap.get(row.entry_id) ?? new Set<string>();
        picks.add(row.team_id);
        entryPickMap.set(row.entry_id, picks);
      }
    }

    const enteredDrafts = new Set<string>();
    for (const draft of drafts) {
      const draftPicks = nextPickMap.get(draft.id) ?? new Set<string>();
      if (draftPicks.size === 0) continue;
      for (const entryPicks of entryPickMap.values()) {
        if (entryPicks.size === 0) continue;
        if (sameTeamSet(draftPicks, entryPicks)) {
          enteredDrafts.add(draft.id);
          break;
        }
      }
    }

    setDraftPickMap(nextPickMap);
    setAlreadyEnteredDraftIds(enteredDrafts);
    setDraftModalLoading(false);
  }

  function toggleDraftSelection(draftId: string) {
    if (alreadyEnteredDraftIds.has(draftId)) return;
    setSelectedDraftIds((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) next.delete(draftId);
      else next.add(draftId);
      return next;
    });
  }

  function selectAllDrafts() {
    setSelectedDraftIds(
      new Set(availableDrafts.filter((draft) => !alreadyEnteredDraftIds.has(draft.id)).map((draft) => draft.id))
    );
  }

  function clearDraftSelection() {
    setSelectedDraftIds(new Set());
  }

  async function createEntry(poolIdValue: string, userId: string, entryName: string): Promise<{ id: string }> {
    const insertWithName = await supabase
      .from("entries")
      .insert({
        pool_id: poolIdValue,
        user_id: userId,
        entry_name: entryName.trim() || "My Bracket",
      })
      .select("id")
      .single();

    if (!insertWithName.error && insertWithName.data) {
      return { id: insertWithName.data.id as string };
    }

    if (!isMissingEntryNameError(insertWithName.error?.message)) {
      if (isSingleEntryPerPoolConstraintError(insertWithName.error?.message)) {
        throw new Error(
          "Your database still allows only one entry per pool. Run db/migrations/20260318_entries_allow_multiple_per_pool.sql, then try again."
        );
      }
      throw new Error(insertWithName.error?.message ?? "Failed to create entry.");
    }

    const insertFallback = await supabase
      .from("entries")
      .insert({
        pool_id: poolIdValue,
        user_id: userId,
      })
      .select("id")
      .single();

    if (insertFallback.error || !insertFallback.data) {
      if (isSingleEntryPerPoolConstraintError(insertFallback.error?.message)) {
        throw new Error(
          "Your database still allows only one entry per pool. Run db/migrations/20260318_entries_allow_multiple_per_pool.sql, then try again."
        );
      }
      throw new Error(insertFallback.error?.message ?? "Failed to create entry.");
    }

    return { id: insertFallback.data.id as string };
  }

  async function submitSelectedDrafts() {
    if (selectedDraftIds.size === 0) {
      setDraftModalMessage("Select at least one draft.");
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setDraftModalMessage("Please log in first.");
      return;
    }

    const selectedRows = availableDrafts.filter(
      (draft) => selectedDraftIds.has(draft.id) && !alreadyEnteredDraftIds.has(draft.id)
    );
    if (selectedRows.length === 0) {
      setDraftModalMessage("Selected draft(s) are already in this pool.");
      return;
    }

    setDraftModalSubmitting(true);
    setDraftModalMessage("");

    let created = 0;
    let skippedEmpty = 0;

    try {
      for (const draft of selectedRows) {
        const draftPickSet = draftPickMap.get(draft.id) ?? new Set<string>();
        const draftPickIds = Array.from(draftPickSet);
        if (draftPickIds.length === 0) {
          skippedEmpty += 1;
          continue;
        }

        const createdEntry = await createEntry(poolId, user.id, draft.name);
        const rows = draftPickIds.map((teamId) => ({
          entry_id: createdEntry.id,
          team_id: teamId,
        }));
        const insertPicks = await supabase.from("entry_picks").insert(rows);
        if (insertPicks.error) {
          throw new Error(insertPicks.error.message);
        }
        created += 1;
      }
    } catch (error: unknown) {
      setDraftModalSubmitting(false);
      setDraftModalMessage(error instanceof Error ? error.message : "Failed to enter selected drafts.");
      return;
    }

    setDraftModalSubmitting(false);

    if (created === 0) {
      if (skippedEmpty > 0) {
        setDraftModalMessage(
          "No entries were created because selected draft(s) have no teams yet. Add picks to drafts and try again."
        );
      } else {
        setDraftModalMessage("No entries were created. Adjust your selection and try again.");
      }
      return;
    }

    closeDraftModal();
    setStatus({
      tone: "success",
      text:
        `Entered ${created} draft${created === 1 ? "" : "s"} into ${pool?.name ?? "this pool"}.` +
        (skippedEmpty > 0 ? ` Skipped ${skippedEmpty} empty draft${skippedEmpty === 1 ? "" : "s"}.` : ""),
    });
    setReloadKey((prev) => prev + 1);
  }

  function closeLeaveModal() {
    if (leaveModalSubmitting) return;
    setLeaveModalOpen(false);
    setLeaveModalLoading(false);
    setLeaveModalSubmitting(false);
    setLeaveModalMessage("");
    setLeaveEntries([]);
    setSelectedLeaveEntryIds(new Set());
  }

  async function openLeaveModal() {
    setStatus(null);
    setLeaveModalOpen(true);
    setLeaveModalLoading(true);
    setLeaveModalSubmitting(false);
    setLeaveModalMessage("");
    setLeaveEntries([]);
    setSelectedLeaveEntryIds(new Set());

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLeaveModalLoading(false);
      setLeaveModalMessage("Please log in first.");
      return;
    }

    const withName = await supabase
      .from("entries")
      .select("id,entry_name")
      .eq("pool_id", poolId)
      .eq("user_id", user.id);

    if (withName.error && !isMissingEntryNameError(withName.error.message)) {
      setLeaveModalLoading(false);
      setLeaveModalMessage(withName.error.message);
      return;
    }

    let nextEntries: LeaveEntryRow[] = [];
    if (withName.error && isMissingEntryNameError(withName.error.message)) {
      const fallback = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id);

      if (fallback.error) {
        setLeaveModalLoading(false);
        setLeaveModalMessage(fallback.error.message);
        return;
      }

      nextEntries = ((fallback.data ?? []) as Array<{ id: string }>).map((row) => ({
        id: row.id,
        entry_name: null,
      }));
    } else {
      nextEntries = (withName.data ?? []) as LeaveEntryRow[];
    }

    const unresolvedEntries = nextEntries.filter((entry) => !(entry.entry_name?.trim().length));
    if (unresolvedEntries.length > 0) {
      const draftsQuery = await supabase
        .from("saved_drafts")
        .select("id,name,updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (!draftsQuery.error) {
        const drafts = ((draftsQuery.data ?? []) as DraftRow[]).sort(sortDraftsByUpdatedAt);
        const draftIds = drafts.map((draft) => draft.id);
        if (draftIds.length > 0) {
          const draftPicksQuery = await supabase
            .from("saved_draft_picks")
            .select("draft_id,team_id")
            .in("draft_id", draftIds);

          const unresolvedEntryIds = unresolvedEntries.map((entry) => entry.id);
          const entryPicksQuery = await supabase
            .from("entry_picks")
            .select("entry_id,team_id")
            .in("entry_id", unresolvedEntryIds);

          if (!draftPicksQuery.error && !entryPicksQuery.error) {
            const draftPickMap = new Map<string, Set<string>>();
            for (const draftId of draftIds) draftPickMap.set(draftId, new Set());
            for (const row of (draftPicksQuery.data ?? []) as SavedDraftPickRow[]) {
              const picks = draftPickMap.get(row.draft_id) ?? new Set<string>();
              picks.add(row.team_id);
              draftPickMap.set(row.draft_id, picks);
            }

            const entryPickMap = new Map<string, Set<string>>();
            for (const entryId of unresolvedEntryIds) entryPickMap.set(entryId, new Set());
            for (const row of (entryPicksQuery.data ?? []) as Array<{ entry_id: string; team_id: string }>) {
              const picks = entryPickMap.get(row.entry_id) ?? new Set<string>();
              picks.add(row.team_id);
              entryPickMap.set(row.entry_id, picks);
            }

            nextEntries = nextEntries.map((entry) => {
              if (entry.entry_name?.trim().length) return entry;
              const entryPicks = entryPickMap.get(entry.id) ?? new Set<string>();
              if (entryPicks.size === 0) return entry;
              const matchedDraft = drafts.find((draft) =>
                sameTeamSet(draftPickMap.get(draft.id) ?? new Set<string>(), entryPicks)
              );
              if (!matchedDraft?.name?.trim()) return entry;
              return { ...entry, entry_name: matchedDraft.name.trim() };
            });
          }
        }
      }
    }

    setLeaveEntries(nextEntries);
    setLeaveModalLoading(false);
  }

  function toggleLeaveEntrySelection(entryId: string) {
    setSelectedLeaveEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function selectAllLeaveEntries() {
    setSelectedLeaveEntryIds(new Set(leaveEntries.map((entry) => entry.id)));
  }

  function clearLeaveSelection() {
    setSelectedLeaveEntryIds(new Set());
  }

  async function submitLeaveSelection() {
    if (leaveEntries.length > 0 && selectedLeaveEntryIds.size === 0) {
      setLeaveModalMessage("Select at least one entry to remove.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setLeaveModalMessage("Session expired. Log in again to continue.");
      return;
    }

    setLeaveModalSubmitting(true);
    setLeaveModalMessage("");

    const entryIds = Array.from(selectedLeaveEntryIds);
    const res = await fetch("/api/pools/leave", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        poolId,
        entryIds: entryIds.length > 0 ? entryIds : undefined,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      removedEntryIds?: string[];
      membershipRemoved?: boolean;
    };

    if (!res.ok) {
      setLeaveModalSubmitting(false);
      setLeaveModalMessage(body.error ?? "Failed to remove selected entries.");
      return;
    }

    if (body.membershipRemoved) {
      setLeaveModalSubmitting(false);
      closeLeaveModal();
      setIsMember(false);
      setStatus({ tone: "success", text: `Left ${pool?.name ?? "this pool"}.` });
      setReloadKey((prev) => prev + 1);
      return;
    }

    const removedIds = new Set(body.removedEntryIds ?? []);
    const remainingEntries = leaveEntries.filter((entry) => !removedIds.has(entry.id));
    setLeaveEntries(remainingEntries);
    setSelectedLeaveEntryIds(new Set());
    setLeaveModalSubmitting(false);
    setLeaveModalMessage("Removed selected entries from this pool.");
    setReloadKey((prev) => prev + 1);
  }

  async function joinPool() {
    setStatus(null);
    setJoining(true);
    trackEvent({
      eventName: "pool_join_attempt",
      poolId,
      metadata: { location: "pool_page", is_private: poolIsPrivate },
    });

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      setStatus({ tone: "error", text: "Please log in first." });
      trackEvent({
        eventName: "pool_join_failure",
        poolId,
        metadata: { location: "pool_page", reason: "not_authenticated" },
      });
      setJoining(false);
      return;
    }

    if (poolIsPrivate && !joinPassword.trim()) {
      setStatus({ tone: "error", text: "Enter this pool's password." });
      trackEvent({
        eventName: "pool_join_failure",
        poolId,
        metadata: { location: "pool_page", reason: "missing_password" },
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
      setStatus({ tone: "error", text: body.error ?? "Failed to join pool." });
      trackEvent({
        eventName: "pool_join_failure",
        poolId,
        metadata: { location: "pool_page", reason: body.error ?? "api_error" },
      });
      setJoining(false);
      return;
    }

    setIsMember(true);
    setJoinPassword("");
    setStatus({
      tone: "success",
      text: "Joined! Choose draft(s) to enter next.",
    });
    trackEvent({
      eventName: "pool_join_success",
      poolId,
      metadata: { location: "pool_page", is_private: poolIsPrivate },
    });
    setJoining(false);
    setReloadKey((prev) => prev + 1);
    await openDraftModal();
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
  const todayEt = useMemo(() => etDayKey(new Date()), []);
  const yesterdayEt = useMemo(() => etDayKey(shiftDate(-1)), []);
  const tomorrowEt = useMemo(() => etDayKey(shiftDate(1)), []);
  const todayFinals = useMemo(
    () =>
      draftedTeamScores
        .filter((g) => {
          if (g.state !== "FINAL") return false;
          const gameDay = etDayKeyFromIso(g.startTime);
          return gameDay === todayEt;
        })
        .slice(0, 12),
    [draftedTeamScores, todayEt]
  );
  const yesterdayFinals = useMemo(
    () =>
      draftedTeamScores
        .filter((g) => {
          if (g.state !== "FINAL") return false;
          const gameDay = etDayKeyFromIso(g.startTime);
          return gameDay === yesterdayEt;
        })
        .slice(0, 12),
    [draftedTeamScores, yesterdayEt]
  );
  const recentFinals = useMemo(
    () => (todayFinals.length > 0 ? todayFinals : yesterdayFinals).slice(0, 6),
    [todayFinals, yesterdayFinals]
  );
  const todayLiveAndUpcoming = useMemo(
    () =>
      draftedTeamScores
        .filter((g) => {
          const gameDay = etDayKeyFromIso(g.startTime);
          return g.state !== "FINAL" && gameDay === todayEt;
        })
        .slice(0, 12),
    [draftedTeamScores, todayEt]
  );
  const tomorrowLiveAndUpcoming = useMemo(
    () =>
      draftedTeamScores
        .filter((g) => {
          const gameDay = etDayKeyFromIso(g.startTime);
          return g.state !== "FINAL" && gameDay === tomorrowEt;
        })
        .slice(0, 12),
    [draftedTeamScores, tomorrowEt]
  );
  const liveAndUpcoming = useMemo(
    () => (todayLiveAndUpcoming.length > 0 ? todayLiveAndUpcoming : tomorrowLiveAndUpcoming).slice(0, 6),
    [todayLiveAndUpcoming, tomorrowLiveAndUpcoming]
  );
  const recentFinalsEmptyMessage = useMemo(() => {
    if (!draftedLoaded) return "Loading your drafted teams...";
    if (isMember !== true) return "Join this pool to see your drafted-team scores.";
    if (draftedTeamCount === 0) return "Enter a saved draft in this pool, then your games will show here.";
    return "No final scores from today or yesterday for your drafted teams.";
  }, [draftedLoaded, isMember, draftedTeamCount]);
  const liveAndUpcomingEmptyMessage = useMemo(() => {
    if (!draftedLoaded) return "Loading your drafted teams...";
    if (isMember !== true) return "Join this pool to see your drafted-team scores.";
    if (draftedTeamCount === 0) return "Enter a saved draft in this pool, then your games will show here.";
    return "No live games today or upcoming games tomorrow for your drafted teams.";
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
            games={recentFinals}
            loading={scoresLoading || !draftedLoaded}
            error={scoresError}
            emptyMessage={recentFinalsEmptyMessage}
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
                ? "This is a private pool. Enter the pool password to join, then pick draft(s) to enter."
                : "This is a public pool. Join now, then pick draft(s) to enter."}
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
                {joining ? "Joining..." : "Join + Choose Drafts"}
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
                href="/drafts"
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
                My Drafts
              </Link>
              <button
                type="button"
                onClick={() => void openDraftModal()}
                style={{
                  flex: "1 1 140px",
                  minWidth: 120,
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  fontWeight: 800,
                  background: "var(--surface)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                Enter Drafts
              </button>
              <button
                type="button"
                onClick={() => void openLeaveModal()}
                style={{
                  flex: "1 1 140px",
                  minWidth: 120,
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid #dc2626",
                  fontWeight: 800,
                  background: "rgba(220,38,38,0.12)",
                  color: "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                Leave Entries
              </button>
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
            emptyMessage={liveAndUpcomingEmptyMessage}
          />
        </div>
      </div>

      {draftModalOpen ? (
        <div
          role="presentation"
          onClick={closeDraftModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 125,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Select drafts to enter"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(640px, 100%)",
              maxHeight: "88vh",
              overflow: "auto",
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              padding: 14,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Enter Drafts in {pool?.name ?? "Pool"}</h2>
              <p style={{ margin: 0, opacity: 0.8 }}>
                Select one or more drafts below. Each selected draft creates its own entry in this pool.
              </p>
            </div>

            {draftModalLoading ? <p style={{ margin: 0 }}>Loading your drafts...</p> : null}

            {!draftModalLoading && availableDrafts.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={selectAllDrafts}
                    disabled={draftModalSubmitting}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: draftModalSubmitting ? "not-allowed" : "pointer",
                      opacity: draftModalSubmitting ? 0.7 : 1,
                    }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearDraftSelection}
                    disabled={draftModalSubmitting}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: draftModalSubmitting ? "not-allowed" : "pointer",
                      opacity: draftModalSubmitting ? 0.7 : 1,
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {availableDrafts.map((draft) => {
                    const picks = draftPickMap.get(draft.id);
                    const pickCount = picks?.size ?? 0;
                    const isAlreadyEntered = alreadyEnteredDraftIds.has(draft.id);
                    const checked = isAlreadyEntered || selectedDraftIds.has(draft.id);
                    return (
                      <label
                        key={draft.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          padding: "10px 12px",
                          background: checked ? "var(--surface-elevated)" : "var(--surface)",
                          cursor: isAlreadyEntered ? "not-allowed" : "pointer",
                          opacity: isAlreadyEntered ? 0.75 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDraftSelection(draft.id)}
                          disabled={draftModalSubmitting || isAlreadyEntered}
                        />
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 900 }}>
                            {draft.name}
                            {isAlreadyEntered ? " (already entered)" : ""}
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.8 }}>
                            {pickCount} team{pickCount === 1 ? "" : "s"} selected
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {!draftModalLoading && availableDrafts.length === 0 ? (
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-muted)",
                  padding: "10px 12px",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>No drafts available.</p>
                <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
                  Open <Link href="/drafts">My Drafts</Link> to create one.
                </p>
              </div>
            ) : null}

            {draftModalMessage ? (
              <p
                style={{
                  margin: 0,
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-muted)",
                  padding: "10px 12px",
                  fontWeight: 700,
                }}
              >
                {draftModalMessage}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
              <Link
                href="/drafts"
                onClick={closeDraftModal}
                style={{
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                  background: "var(--surface)",
                  fontWeight: 800,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Manage Drafts
              </Link>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={closeDraftModal}
                  disabled={draftModalSubmitting}
                  style={{
                    padding: "10px 12px",
                    minHeight: 44,
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    fontWeight: 800,
                    cursor: draftModalSubmitting ? "not-allowed" : "pointer",
                    opacity: draftModalSubmitting ? 0.7 : 1,
                  }}
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void submitSelectedDrafts()}
                  disabled={draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading}
                  style={{
                    padding: "10px 12px",
                    minHeight: 44,
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    fontWeight: 900,
                    cursor:
                      draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading
                        ? "not-allowed"
                        : "pointer",
                    opacity: draftModalSubmitting || selectedDraftCount === 0 || draftModalLoading ? 0.7 : 1,
                  }}
                >
                  {draftModalSubmitting
                    ? "Entering..."
                    : `Enter ${selectedDraftCount} Draft${selectedDraftCount === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {leaveModalOpen ? (
        <div
          role="presentation"
          onClick={closeLeaveModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 118,
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Remove entries from pool"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(640px, 100%)",
              maxHeight: "88vh",
              overflow: "auto",
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              padding: 14,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                Remove Entries from {pool?.name ?? "Pool"}
              </h2>
              <p style={{ margin: 0, opacity: 0.8 }}>
                Choose which entries to remove from this pool.
              </p>
            </div>

            {leaveModalLoading ? <p style={{ margin: 0 }}>Loading your pool entries...</p> : null}

            {!leaveModalLoading && leaveEntries.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={selectAllLeaveEntries}
                    disabled={leaveModalSubmitting}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: leaveModalSubmitting ? "not-allowed" : "pointer",
                      opacity: leaveModalSubmitting ? 0.7 : 1,
                    }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearLeaveSelection}
                    disabled={leaveModalSubmitting}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background: "var(--surface)",
                      fontWeight: 800,
                      cursor: leaveModalSubmitting ? "not-allowed" : "pointer",
                      opacity: leaveModalSubmitting ? 0.7 : 1,
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {leaveEntries.map((entry, index) => {
                    const checked = selectedLeaveEntryIds.has(entry.id);
                    return (
                      <label
                        key={entry.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          border: "1px solid var(--border-color)",
                          borderRadius: 10,
                          padding: "10px 12px",
                          background: checked ? "var(--surface-elevated)" : "var(--surface)",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLeaveEntrySelection(entry.id)}
                          disabled={leaveModalSubmitting}
                        />
                        <div style={{ display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 900 }}>{leaveEntryLabel(entry, index)}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>Entry ID: {entry.id.slice(0, 8)}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}

            {!leaveModalLoading && leaveEntries.length === 0 ? (
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-muted)",
                  padding: "10px 12px",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>No entries found for this pool.</p>
                <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
                  Use the red button below to leave this pool.
                </p>
              </div>
            ) : null}

            {leaveModalMessage ? (
              <p
                style={{
                  margin: 0,
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  background: "var(--surface-muted)",
                  padding: "10px 12px",
                  fontWeight: 700,
                }}
              >
                {leaveModalMessage}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={closeLeaveModal}
                disabled={leaveModalSubmitting}
                style={{
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 800,
                  cursor: leaveModalSubmitting ? "not-allowed" : "pointer",
                  opacity: leaveModalSubmitting ? 0.7 : 1,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitLeaveSelection()}
                disabled={leaveModalSubmitting || leaveModalLoading || (leaveEntries.length > 0 && selectedLeaveCount === 0)}
                style={{
                  padding: "10px 12px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "1px solid #dc2626",
                  background: "rgba(220,38,38,0.12)",
                  color: "#dc2626",
                  fontWeight: 900,
                  cursor:
                    leaveModalSubmitting || leaveModalLoading || (leaveEntries.length > 0 && selectedLeaveCount === 0)
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    leaveModalSubmitting || leaveModalLoading || (leaveEntries.length > 0 && selectedLeaveCount === 0)
                      ? 0.7
                      : 1,
                }}
              >
                {leaveModalSubmitting
                  ? "Removing..."
                  : leaveEntries.length > 0
                    ? `Remove ${selectedLeaveCount} Entr${selectedLeaveCount === 1 ? "y" : "ies"}`
                    : "Leave Pool"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
