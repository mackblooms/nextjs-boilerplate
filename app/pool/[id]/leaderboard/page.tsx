"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { setStoredActivePoolId } from "../../../../lib/activePool";
import { supabase } from "../../../../lib/supabaseClient";
import { withAvatarFallback } from "../../../../lib/avatar";
import { formatDraftLockTimeET, isDraftLocked, resolveDraftLockTime } from "../../../../lib/draftLock";
import {
  scoreEntries,
  scoreTeamWinsDetailed,
  type ScoringGame,
} from "../../../../lib/scoring";
import { toSchoolDisplayName } from "../../../../lib/teamNames";

type Row = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
  entry_name: string | null;
  full_name: string | null;
  avatar_url: string;
  total_score: number;
  active_team_count: number;
  drafted_teams: DraftedTeam[];
  rank: number;
  rank_delta: number | null;
};

type DraftedTeam = {
  team_id: string;
  team_name: string;
  seed: number | null;
  logo_url: string | null;
  is_active: boolean;
  is_in_bracket: boolean;
};

type TeamSeedRow = {
  id: string;
  seed_in_region: number | null;
  region: string | null;
  name: string | null;
  cost: number | null;
  logo_url: string | null;
  espn_team_id: string | number | null;
};
type PickRow = { entry_id: string; team_id: string };
type ScoringGameWithDate = ScoringGame & {
  game_date: string | null;
  start_time: string | null;
};
type ProfileLookupRow = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url?: string | null;
};

type ArchiveSeasonRow = {
  season: number;
  created_at: string;
  updated_at: string;
};

type ArchivedTeam = {
  team_id: string;
  team_name: string;
  seed: number | null;
  cost: number | null;
  logo_url: string | null;
  round_reached: string | null;
  total_team_score: number;
};

type ArchivedEntry = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string;
  entry_name: string | null;
  total_score: number;
  rank: number;
  drafted_teams: ArchivedTeam[];
};

type ArchiveSnapshot = {
  version: 1;
  season: number;
  captured_at: string;
  entries: ArchivedEntry[];
};

type ArchiveDetail = {
  season: number;
  created_at: string;
  updated_at: string;
  snapshot: ArchiveSnapshot;
  my_entry: ArchivedEntry | null;
};

type TeamValueRow = {
  team_id: string;
  team_name: string;
  logo_url: string | null;
  cost: number;
  points: number;
  roi: number;
};

type TeamPopularityRow = {
  team_id: string;
  team_name: string;
  logo_url: string | null;
  selections: number;
};

type PoolOption = {
  id: string;
  name: string;
};

type EntryBreakdownTeamTotal = {
  team_id: string;
  team_name: string;
  seed: number | null;
  logo_url: string | null;
  points: number;
};

type EntryBreakdownEvent = {
  id: string;
  team_id: string;
  team_name: string;
  seed: number | null;
  logo_url: string | null;
  round: string;
  opponent_seed: number | null;
  base_points: number;
  seed_multiplier: number;
  scaled_base_points: number;
  upset_bonus: number;
  historic_bonus: number;
  points_awarded: number;
  game_index: number;
};

type EntryScoreBreakdown = {
  entry_id: string;
  draft_label: string;
  player_label: string;
  total_score: number;
  team_points: number;
  perfect_r64_bonus: number;
  team_totals: EntryBreakdownTeamTotal[];
  events: EntryBreakdownEvent[];
};

type LeaderboardMode = "live" | "forecast";

type ForecastEntry = {
  entry_id: string;
  current_score: number;
  current_rank: number;
  expected_score: number;
  expected_add: number;
  projected_score_most_likely: number;
  projected_add_most_likely: number;
  projected_rank_most_likely: number;
  expected_rank: number;
};

type ForecastRoundCode = "R64" | "R32" | "S16" | "E8" | "F4" | "CHIP";

type RankScenarioSeedRow = {
  entry_id: string;
  entry_name: string | null;
  display_name: string | null;
  final_four_count: number;
  championship_count: number;
  total_score: number;
};

type RootingRadarItem = {
  id: string;
  matchup: string;
  round: string;
  game_state: "LIVE" | "UPCOMING";
  recommended_team: string;
  alternate_team: string;
  recommended_rank: number;
  alternate_rank: number;
  rank_swing: number;
  focus_entry_label: string;
  focus_score_swing: number;
};

type SwingAlertItem = {
  id: string;
  summary: string;
  detail: string;
};

type RivalryCard = {
  id: string;
  focus_entry_label: string;
  rival_entry_label: string;
  score_gap: number;
  focus_rank: number;
  rival_rank: number;
  shared_active_count: number;
  focus_only_active: string[];
  rival_only_active: string[];
};

const ROUND_ORDER: Record<string, number> = {
  R64: 1,
  R32: 2,
  S16: 3,
  E8: 4,
  F4: 5,
  CHIP: 6,
};
const LEADERBOARD_REFRESH_MS = 60_000;
const FEATURE_DRAWER_SEEN_KEY = "leaderboard_feature_drawer_seen_v1";

function isMissingAvatarColumnError(error: { message?: string; code?: string } | null) {
  return Boolean(
    error?.code === "PGRST204" &&
      error.message?.includes("profiles") &&
      error.message.includes("avatar_url"),
  );
}

function isMissingColumnError(error: { code?: string } | null) {
  return Boolean(error?.code === "PGRST204");
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

function gameDayKey(game: { game_date: string | null; start_time: string | null }) {
  if (game.game_date) {
    const day = game.game_date.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;

    const gameDateMs = Date.parse(game.game_date);
    if (Number.isFinite(gameDateMs)) {
      return etDayKey(new Date(gameDateMs));
    }
  }

  if (!game.start_time) return null;
  const d = new Date(game.start_time);
  if (Number.isNaN(d.getTime())) return null;
  return etDayKey(d);
}

function gameHasStarted(
  game: ScoringGameWithDate,
  nowMs: number,
  todayEt: string,
) {
  if (game.winner_team_id) return true;

  if (game.start_time) {
    const startMs = Date.parse(game.start_time);
    if (Number.isFinite(startMs) && startMs <= nowMs) return true;
  }

  const day = gameDayKey(game);
  if (day && day < todayEt) return true;

  return false;
}

function hasGamesStarted(games: ScoringGameWithDate[]) {
  const nowMs = Date.now();
  const todayEt = etDayKey(new Date());

  for (const game of games) {
    if (gameHasStarted(game, nowMs, todayEt)) return true;
  }

  return false;
}

function roundReachedOrderByTeam(games: ScoringGame[]): Map<string, number> {
  const out = new Map<string, number>();

  for (const game of games) {
    const order = ROUND_ORDER[game.round] ?? 0;
    if (!order) continue;

    for (const teamId of [game.team1_id, game.team2_id]) {
      if (!teamId) continue;
      const current = out.get(teamId) ?? 0;
      if (order > current) out.set(teamId, order);
    }
  }

  return out;
}

function rankRows<
  T extends {
    total_score: number;
    entry_name: string | null;
    display_name: string | null;
    final_four_count: number;
    championship_count: number;
  },
>(rows: T[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      b.total_score - a.total_score ||
      b.final_four_count - a.final_four_count ||
      b.championship_count - a.championship_count ||
      (a.entry_name ?? a.display_name ?? "").localeCompare(
        b.entry_name ?? b.display_name ?? "",
      ),
  );

  let prevScore: number | null = null;
  let prevRank = 0;
  return sorted.map((row, idx) => {
    const rank = prevScore === row.total_score ? prevRank : idx + 1;
    prevScore = row.total_score;
    prevRank = rank;
    return { ...row, rank };
  });
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

function normalizeTeamAliasName(name: string | null | undefined) {
  return (name ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[.']/g, "")
    .replace(/\bcalifornia\b/g, "ca")
    .replace(/\bcal\b/g, "ca")
    .replace(/\bnorth\b/g, "n")
    .replace(/\bsouth\b/g, "s")
    .replace(/\beast\b/g, "e")
    .replace(/\bwest\b/g, "w")
    .replace(/\bstate\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

function teamAliasKey(name: string | null | undefined, region: string | null | undefined) {
  const normalized = normalizeTeamAliasName(name);
  const regionKey = (region ?? "").toLowerCase().trim();
  if (!normalized || !regionKey) return null;
  return `${normalized}|${regionKey}`;
}

type AliasDisplayMeta = {
  normalized_name: string;
  seed: number;
  logo_url: string | null;
};

function resolveAliasDisplayMeta(
  name: string | null | undefined,
  region: string | null | undefined,
  exactByKey: Map<string, AliasDisplayMeta>,
  byRegion: Map<string, AliasDisplayMeta[]>,
) {
  const exactKey = teamAliasKey(name, region);
  if (exactKey) {
    const exact = exactByKey.get(exactKey);
    if (exact) return exact;
  }

  const normalized = normalizeTeamAliasName(name);
  const regionKey = (region ?? "").toLowerCase().trim();
  if (!normalized || !regionKey) return null;

  const candidates = byRegion.get(regionKey) ?? [];
  if (candidates.length === 0) return null;

  const prefixMatches = candidates.filter(
    (candidate) =>
      candidate.normalized_name.startsWith(normalized) ||
      normalized.startsWith(candidate.normalized_name),
  );
  if (prefixMatches.length === 1) return prefixMatches[0];

  const sourceTokens = normalized.split(" ").filter(Boolean);
  const tokenMatches = candidates.filter((candidate) => {
    const candidateTokens = candidate.normalized_name.split(" ").filter(Boolean);
    const sourceInCandidate = sourceTokens.every((token) => candidateTokens.includes(token));
    const candidateInSource = candidateTokens.every((token) => sourceTokens.includes(token));
    return sourceInCandidate || candidateInSource;
  });
  if (tokenMatches.length === 1) return tokenMatches[0];

  return null;
}

function formatArchiveRound(round: string | null) {
  if (!round) return "Did not make tournament";
  if (round === "R64") return "Round of 64";
  if (round === "R32") return "Round of 32";
  if (round === "S16") return "Round of 16";
  if (round === "E8") return "Round of 8";
  if (round === "F4") return "Round of 4";
  if (round === "CHIP") return "Championship";
  return round;
}

function formatWhen(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatRoi(roi: number) {
  return `${roi.toFixed(2)}x`;
}

function formatRoundLabel(round: string) {
  return formatArchiveRound(round);
}

function formatPointsDelta(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function formatExpectedScore(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1);
}

function rankMapForRows(rows: RankScenarioSeedRow[]) {
  const ranked = rankRows(rows);
  const out = new Map<string, number>();
  for (const row of ranked) out.set(row.entry_id, row.rank);
  return out;
}

function bestRankAcrossEntries(rankByEntry: Map<string, number>, entryIds: string[]) {
  let best: number | null = null;
  for (const entryId of entryIds) {
    const rank = rankByEntry.get(entryId);
    if (rank == null) continue;
    best = best == null ? rank : Math.min(best, rank);
  }
  return best;
}

function formatEntryLabel(row: {
  entry_name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
}) {
  const draftLabel = row.entry_name?.trim() || "Unnamed draft";
  const profileLabel = row.full_name?.trim() || row.display_name?.trim() || "Unnamed player";
  return `${draftLabel} (${profileLabel})`;
}

function activeTeamNames(
  entry: Row | undefined,
  excludeSet: Set<string>,
  limit: number,
) {
  if (!entry) return [];
  const names = entry.drafted_teams
    .filter((team) => team.is_active && !excludeSet.has(team.team_id))
    .map((team) => toSchoolDisplayName(team.team_name))
    .slice(0, limit);
  return names;
}

function TeamValueTable({
  title,
  rows,
}: {
  title: string;
  rows: TeamValueRow[];
}) {
  return (
    <section
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border-color)",
          fontWeight: 900,
          background: "var(--surface-muted)",
        }}
      >
        {title}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "12px", opacity: 0.8 }}>No team data yet.</div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 56px 62px 58px",
              gap: 8,
              padding: "8px 12px",
              fontWeight: 800,
              borderBottom: "1px solid var(--border-color)",
              fontSize: 12,
              letterSpacing: 0.2,
            }}
          >
            <div>Team</div>
            <div style={{ textAlign: "right" }}>Price</div>
            <div style={{ textAlign: "right" }}>Points</div>
            <div style={{ textAlign: "right" }}>ROI</div>
          </div>

          {rows.map((row) => (
            <div
              key={row.team_id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 56px 62px 58px",
                gap: 8,
                padding: "8px 12px",
                alignItems: "center",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {toSchoolDisplayName(row.team_name)}
                </span>
              </div>
              <div style={{ textAlign: "right", fontWeight: 700 }}>{row.cost}</div>
              <div style={{ textAlign: "right", fontWeight: 700 }}>{row.points}</div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>{formatRoi(row.roi)}</div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function TeamPopularityTable({ rows }: { rows: TeamPopularityRow[] }) {
  return (
    <section
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border-color)",
          fontWeight: 900,
          background: "var(--surface-muted)",
        }}
      >
        Most Popular Teams
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "12px", opacity: 0.8 }}>No selections yet.</div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 88px",
              gap: 8,
              padding: "8px 12px",
              fontWeight: 800,
              borderBottom: "1px solid var(--border-color)",
              fontSize: 12,
              letterSpacing: 0.2,
            }}
          >
            <div>Team</div>
            <div style={{ textAlign: "right" }}>Selections</div>
          </div>

          {rows.map((row) => (
            <div
              key={row.team_id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 88px",
                gap: 8,
                padding: "8px 12px",
                alignItems: "center",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {toSchoolDisplayName(row.team_name)}
                </span>
              </div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>{row.selections}</div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export default function LeaderboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [memberPools, setMemberPools] = useState<PoolOption[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draftLocked, setDraftLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);
  const [isPoolOwner, setIsPoolOwner] = useState(false);
  const [showTeamInsights, setShowTeamInsights] = useState(false);
  const [bestValueTeams, setBestValueTeams] = useState<TeamValueRow[]>([]);
  const [popularTeams, setPopularTeams] = useState<TeamPopularityRow[]>([]);
  const [expandedTeamsByEntry, setExpandedTeamsByEntry] = useState<Record<string, boolean>>({});
  const [breakdownByEntry, setBreakdownByEntry] = useState<Record<string, EntryScoreBreakdown>>({});
  const [openBreakdownEntryId, setOpenBreakdownEntryId] = useState<string | null>(null);
  const [hoveredMovementEntryId, setHoveredMovementEntryId] = useState<string | null>(null);
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>("live");
  const [forecastByEntry, setForecastByEntry] = useState<Record<string, ForecastEntry>>({});
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState<string | null>(null);
  const [forecastHorizonRound, setForecastHorizonRound] = useState<ForecastRoundCode | null>(null);
  const [forecastMsg, setForecastMsg] = useState("");
  const [forecastInfoOpen, setForecastInfoOpen] = useState(false);
  const [rootingRadar, setRootingRadar] = useState<RootingRadarItem[]>([]);
  const [swingAlerts, setSwingAlerts] = useState<SwingAlertItem[]>([]);
  const [rivalryCards, setRivalryCards] = useState<RivalryCard[]>([]);
  const [featuresDrawerOpen, setFeaturesDrawerOpen] = useState(false);
  const [showFeatureDrawerCallout, setShowFeatureDrawerCallout] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveDetailLoading, setArchiveDetailLoading] = useState(false);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState("");
  const [archiveSaveMsg, setArchiveSaveMsg] = useState("");
  const [archiveYears, setArchiveYears] = useState<ArchiveSeasonRow[]>([]);
  const [archiveSeason, setArchiveSeason] = useState<number | null>(null);
  const [archiveDetail, setArchiveDetail] = useState<ArchiveDetail | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const currentSeason = new Date().getUTCFullYear();

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadArchiveSeason(season: number) {
    const token = await getAccessToken();
    if (!token) {
      setArchiveMsg("Session expired. Log in again.");
      return;
    }

    setArchiveDetailLoading(true);
    setArchiveMsg("");

    try {
      const res = await fetch(
        `/api/pools/archive?poolId=${encodeURIComponent(poolId)}&season=${season}`,
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      const payload = (await res.json().catch(() => ({}))) as {
        archive?: ArchiveDetail | null;
        isOwner?: boolean;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to load archive season."));
      }

      setIsPoolOwner(Boolean(payload.isOwner));
      setArchiveSeason(season);
      setArchiveDetail(payload.archive ?? null);
      if (!payload.archive) {
        setArchiveMsg(`No archive found for ${season}.`);
      }
    } catch (error: unknown) {
      setArchiveMsg(error instanceof Error ? error.message : "Failed to load archive season.");
    } finally {
      setArchiveDetailLoading(false);
    }
  }

  async function openArchive() {
    const token = await getAccessToken();
    if (!token) {
      setArchiveOpen(true);
      setArchiveMsg("Session expired. Log in again.");
      return;
    }

    setArchiveOpen(true);
    setArchiveLoading(true);
    setArchiveDetailLoading(false);
    setArchiveMsg("");
    setArchiveSaveMsg("");

    try {
      const res = await fetch(`/api/pools/archive?poolId=${encodeURIComponent(poolId)}`, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      const payload = (await res.json().catch(() => ({}))) as {
        seasons?: ArchiveSeasonRow[];
        isOwner?: boolean;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to load archive years."));
      }

      const seasons = Array.isArray(payload.seasons) ? payload.seasons : [];
      setArchiveYears(seasons);
      setIsPoolOwner(Boolean(payload.isOwner));

      if (seasons.length === 0) {
        setArchiveSeason(null);
        setArchiveDetail(null);
        setArchiveMsg("No archived seasons yet.");
        return;
      }

      const preferredSeason =
        archiveSeason && seasons.some((row) => row.season === archiveSeason)
          ? archiveSeason
          : seasons[0].season;

      await loadArchiveSeason(preferredSeason);
    } catch (error: unknown) {
      setArchiveMsg(error instanceof Error ? error.message : "Failed to load archive years.");
    } finally {
      setArchiveLoading(false);
    }
  }

  async function saveCurrentSeasonArchive() {
    const token = await getAccessToken();
    if (!token) {
      setArchiveSaveMsg("Session expired. Log in again.");
      return;
    }

    setArchiveSaving(true);
    setArchiveSaveMsg("");

    try {
      const res = await fetch("/api/pools/archive", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          poolId,
          season: currentSeason,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        throw new Error(apiErrorMessage(payload, "Failed to save archive snapshot."));
      }

      setArchiveSaveMsg(`Saved ${currentSeason} archive.`);
      await openArchive();
      await loadArchiveSeason(currentSeason);
    } catch (error: unknown) {
      setArchiveSaveMsg(
        error instanceof Error ? error.message : "Failed to save archive snapshot.",
      );
    } finally {
      setArchiveSaving(false);
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!archiveOpen) {
        setRefreshTick((value) => value + 1);
      }
    }, LEADERBOARD_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [archiveOpen]);

  useEffect(() => {
    const load = async () => {
      const isBackgroundRefresh = refreshTick > 0;
      if (!isBackgroundRefresh) {
        setLoading(true);
        setShowTeamInsights(false);
        setBestValueTeams([]);
        setPopularTeams([]);
        setBreakdownByEntry({});
        setOpenBreakdownEntryId(null);
        setForecastByEntry({});
        setForecastUpdatedAt(null);
        setForecastHorizonRound(null);
      }
      setMsg("");
      setForecastMsg("");
      setRootingRadar([]);
      setSwingAlerts([]);
      setRivalryCards([]);

      try {
        await fetch("/api/scores/live?lookbackDays=1&lookaheadDays=0", { cache: "no-store" });
      } catch {
        // Live scores may be temporarily unavailable; continue loading leaderboard data.
      }

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setMemberPools([]);
        setMsg("Please log in first.");
        setLoading(false);
        return;
      }
      const user = authData.user;
      setMyUserId(user.id);

      const { data: memberships, error: memberErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("user_id", user.id);

      if (memberErr) {
        setMemberPools([]);
        setMsg(memberErr.message);
        setLoading(false);
        return;
      }

      const membershipPoolIds = Array.from(
        new Set((memberships ?? []).map((membership) => membership.pool_id).filter(Boolean)),
      );

      if (membershipPoolIds.length === 0) {
        setMemberPools([]);
        setMsg("Join a pool to view the leaderboard.");
        setLoading(false);
        return;
      }

      const { data: memberPoolRows, error: memberPoolErr } = await supabase
        .from("pools")
        .select("id,name")
        .in("id", membershipPoolIds)
        .order("name", { ascending: true });

      if (memberPoolErr) {
        setMemberPools([]);
        setMsg(memberPoolErr.message);
        setLoading(false);
        return;
      }

      const joinedPools = ((memberPoolRows ?? []) as PoolOption[]).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      setMemberPools(joinedPools);

      if (!membershipPoolIds.includes(poolId)) {
        setMsg("Join this pool to view the leaderboard.");
        setLoading(false);
        return;
      }

      setStoredActivePoolId(poolId);

      const { data: poolRow, error: poolErr } = await supabase
        .from("pools")
        .select("name,lock_time,created_by")
        .eq("id", poolId)
        .single();

      if (poolErr) {
        setMsg(poolErr.message);
        setLoading(false);
        return;
      }

      const resolvedLockTime = resolveDraftLockTime(poolRow?.lock_time ?? null);
      const isLocked = isDraftLocked(poolRow?.lock_time ?? null);
      setLockTime(resolvedLockTime);
      setDraftLocked(isLocked);
      setIsPoolOwner(poolRow?.created_by === user.id);

      const { data, error } = await supabase
        .from("pool_leaderboard")
        .select("entry_id,user_id,display_name")
        .eq("pool_id", poolId);

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      const baseRows = (data ?? []) as Omit<
        Row,
        "total_score" | "rank" | "rank_delta" | "full_name" | "entry_name" | "avatar_url"
      >[];
      const entryIds = baseRows.map((r) => r.entry_id);

      let draftNameByEntry = new Map<string, string>();
      const token = await getAccessToken();
      if (token) {
        try {
          const draftNameRes = await fetch(`/api/pools/draft-names?poolId=${encodeURIComponent(poolId)}`, {
            headers: {
              authorization: `Bearer ${token}`,
            },
          });

          if (draftNameRes.ok) {
            const payload = (await draftNameRes.json().catch(() => ({}))) as {
              draftNamesByEntry?: Record<string, string>;
            };
            draftNameByEntry = new Map(
              Object.entries(payload.draftNamesByEntry ?? {}).map(([entryId, draftName]) => [
                entryId,
                String(draftName),
              ]),
            );
          }
        } catch {
          // Keep leaderboard usable even if draft-name lookup is temporarily unavailable.
        }
      }

      const userIds = Array.from(new Set(baseRows.map((r) => r.user_id)));
      let profileByUser = new Map<
        string,
        { full_name: string | null; avatar_url: string | null }
      >();
      if (userIds.length > 0) {
        let profileRows: ProfileLookupRow[] = [];

        while (true) {
          const { data, error: profilesErr } = await supabase
            .from("profiles")
            .select("user_id,display_name,full_name,avatar_url")
            .in("user_id", userIds);

          if (!profilesErr) {
            profileRows = (data as ProfileLookupRow[] | null) ?? [];
            break;
          }

          if (isMissingAvatarColumnError(profilesErr)) {
            const fallback = await supabase
              .from("profiles")
              .select("user_id,display_name,full_name")
              .in("user_id", userIds);

            if (fallback.error) {
              setMsg(fallback.error.message);
              setLoading(false);
              return;
            }

            profileRows = (fallback.data as ProfileLookupRow[] | null) ?? [];
            break;
          }

          setMsg(profilesErr.message);
          setLoading(false);
          return;
        }

        profileByUser = new Map(
          profileRows.map((row) => [
            row.user_id,
            {
              full_name: row.full_name ?? row.display_name,
              avatar_url: row.avatar_url ?? null,
            },
          ]),
        );
      }

      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,seed_in_region,region,name,cost,logo_url,espn_team_id");

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }

      const teamRowsList = ((teamRows as TeamSeedRow[] | null) ?? []);
      const teamSeedById = new Map(teamRowsList.map((t) => [t.id, t.seed_in_region]));

      let gameRows: ScoringGameWithDate[] = [];
      const gameQuery = await supabase
        .from("games")
        .select("round,team1_id,team2_id,winner_team_id,game_date,start_time");

      if (!gameQuery.error) {
        gameRows = (gameQuery.data as ScoringGameWithDate[] | null) ?? [];
      } else if (isMissingColumnError(gameQuery.error)) {
        const fallback = await supabase
          .from("games")
          .select("round,team1_id,team2_id,winner_team_id");

        if (fallback.error) {
          setMsg(fallback.error.message);
          setLoading(false);
          return;
        }

        gameRows = (((fallback.data as ScoringGame[] | null) ?? []).map((row) => ({
          ...row,
          game_date: null,
          start_time: null,
        })));
      } else {
        setMsg(gameQuery.error.message);
        setLoading(false);
        return;
      }

      let picksByEntry = new Map<string, string[]>();

      const gameTeamIds = new Set<string>();
      for (const game of gameRows) {
        if (game.team1_id) gameTeamIds.add(game.team1_id);
        if (game.team2_id) gameTeamIds.add(game.team2_id);
        if (game.winner_team_id) gameTeamIds.add(game.winner_team_id);
      }

      if (entryIds.length > 0) {
        const { data: pickRows, error: picksErr } = await supabase
          .from("entry_picks")
          .select("entry_id,team_id")
          .in("entry_id", entryIds);

        if (picksErr) {
          setMsg(picksErr.message);
          setLoading(false);
          return;
        }

        picksByEntry = new Map<string, string[]>();
        for (const row of (pickRows ?? []) as PickRow[]) {
          const arr = picksByEntry.get(row.entry_id) ?? [];
          arr.push(row.team_id);
          picksByEntry.set(row.entry_id, arr);
        }
      }

      const eliminatedTeamIds = new Set<string>();
      for (const game of gameRows) {
        if (!game.winner_team_id) continue;
        if (game.team1_id && game.team2_id) {
          if (game.winner_team_id === game.team1_id) {
            eliminatedTeamIds.add(game.team2_id);
          } else if (game.winner_team_id === game.team2_id) {
            eliminatedTeamIds.add(game.team1_id);
          }
        }
      }

      const scoredEntries = scoreEntries(gameRows, teamSeedById, picksByEntry);
      const teamScores = scoredEntries.teamScoresByTeamId;
      const teamWinScoring = scoreTeamWinsDetailed(gameRows, teamSeedById);
      const teamWinEventsByTeamId = teamWinScoring.eventsByTeamId;
      const currentRoundReachedByTeam = roundReachedOrderByTeam(gameRows);

      const gamesStarted = hasGamesStarted(gameRows);
      const shouldShowInsights = isLocked && gamesStarted;
      const teamMetaById = new Map(teamRowsList.map((row) => [row.id, row]));
      const inBracketAliasMetaByKey = new Map<string, AliasDisplayMeta>();
      const inBracketAliasMetaByRegion = new Map<string, AliasDisplayMeta[]>();
      for (const row of teamRowsList) {
        if (!gameTeamIds.has(row.id)) continue;
        if (typeof row.seed_in_region !== "number") continue;
        const normalized = normalizeTeamAliasName(row.name);
        const regionKey = (row.region ?? "").toLowerCase().trim();
        if (!normalized || !regionKey) continue;
        const meta: AliasDisplayMeta = {
          normalized_name: normalized,
          seed: row.seed_in_region,
          logo_url: row.logo_url ?? null,
        };
        const key = teamAliasKey(row.name, row.region);
        if (key && !inBracketAliasMetaByKey.has(key)) {
          inBracketAliasMetaByKey.set(key, meta);
        }
        const regionRows = inBracketAliasMetaByRegion.get(regionKey) ?? [];
        if (!regionRows.some((existing) => existing.normalized_name === normalized)) {
          regionRows.push(meta);
          inBracketAliasMetaByRegion.set(regionKey, regionRows);
        }
      }

      if (shouldShowInsights) {
        const BEST_WORST_LIMIT = 6;
        const POPULAR_LIMIT = 7;
        const nowMs = Date.now();
        const todayEt = etDayKey(new Date());

        const selectionCountByTeam = new Map<string, number>();
        for (const teamIds of picksByEntry.values()) {
          for (const teamId of teamIds) {
            selectionCountByTeam.set(teamId, (selectionCountByTeam.get(teamId) ?? 0) + 1);
          }
        }

        const popularityRows: TeamPopularityRow[] = [];
        for (const [teamId, selections] of selectionCountByTeam.entries()) {
          const teamMeta = teamMetaById.get(teamId);
          const teamName = toSchoolDisplayName(teamMeta?.name?.trim()) || "Unknown team";
          const logoUrl = teamMeta?.logo_url ?? null;
          popularityRows.push({
            team_id: teamId,
            team_name: teamName,
            logo_url: logoUrl,
            selections,
          });
        }

        const startedTeamIds = new Set<string>();
        for (const game of gameRows) {
          if (!gameHasStarted(game, nowMs, todayEt)) continue;
          if (game.team1_id) startedTeamIds.add(game.team1_id);
          if (game.team2_id) startedTeamIds.add(game.team2_id);
        }

        const valueRows: TeamValueRow[] = [];
        for (const teamId of startedTeamIds) {
          const teamMeta = teamMetaById.get(teamId);
          const teamName = toSchoolDisplayName(teamMeta?.name?.trim()) || "Unknown team";
          const logoUrl = teamMeta?.logo_url ?? null;
          const cost = teamMeta?.cost;
          if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) continue;

          const points = teamScores.get(teamId) ?? 0;
          valueRows.push({
            team_id: teamId,
            team_name: teamName,
            logo_url: logoUrl,
            cost,
            points,
            roi: points / cost,
          });
        }

        const bestRows = [...valueRows]
          .sort(
            (a, b) =>
              b.roi - a.roi ||
              b.points - a.points ||
              a.team_name.localeCompare(b.team_name),
          )
          .slice(0, BEST_WORST_LIMIT);

        const popularRows = [...popularityRows]
          .sort(
            (a, b) =>
              b.selections - a.selections ||
              a.team_name.localeCompare(b.team_name),
          )
          .slice(0, POPULAR_LIMIT);

        setShowTeamInsights(true);
        setBestValueTeams(bestRows);
        setPopularTeams(popularRows);
      } else {
        setShowTeamInsights(false);
        setBestValueTeams([]);
        setPopularTeams([]);
      }

      const computed = baseRows
        .map((r) => {
          const totalScore = scoredEntries.totalScoreByEntryId.get(r.entry_id) ?? 0;
          const entryTeamIds = Array.from(new Set(picksByEntry.get(r.entry_id) ?? []));
          const draftedTeams = entryTeamIds
            .map((teamId) => {
              const teamMeta = teamMetaById.get(teamId);
              const isInBracket = gameTeamIds.has(teamId);
              const aliasMeta = !isInBracket
                ? resolveAliasDisplayMeta(
                    teamMeta?.name ?? null,
                    teamMeta?.region ?? null,
                    inBracketAliasMetaByKey,
                    inBracketAliasMetaByRegion,
                  )
                : null;
              return {
                team_id: teamId,
                team_name: toSchoolDisplayName(teamMeta?.name?.trim()) || "Unknown team",
                // Use bracket-verified seed when possible; fallback to alias-matched bracket seed.
                seed:
                  (isInBracket ? (teamMeta?.seed_in_region ?? null) : null) ??
                  aliasMeta?.seed ??
                  null,
                logo_url: teamMeta?.logo_url ?? aliasMeta?.logo_url ?? null,
                // Treat teams missing from bracket game data as not alive.
                is_active: isInBracket && !eliminatedTeamIds.has(teamId),
                is_in_bracket: isInBracket,
              };
            })
            .sort(
              (a, b) =>
                Number(b.is_active) - Number(a.is_active) ||
                (a.seed ?? 99) - (b.seed ?? 99) ||
                a.team_name.localeCompare(b.team_name),
            );
          const activeTeamCount = draftedTeams.reduce(
            (sum, team) => sum + (team.is_active ? 1 : 0),
            0,
          );
          const finalFourCount = entryTeamIds.reduce((sum, teamId) => {
            return sum + ((currentRoundReachedByTeam.get(teamId) ?? 0) >= ROUND_ORDER.F4 ? 1 : 0);
          }, 0);
          const championshipCount = entryTeamIds.reduce((sum, teamId) => {
            return sum + ((currentRoundReachedByTeam.get(teamId) ?? 0) >= ROUND_ORDER.CHIP ? 1 : 0);
          }, 0);

          return {
            ...r,
            entry_name: draftNameByEntry.get(r.entry_id) ?? null,
            full_name: profileByUser.get(r.user_id)?.full_name ?? null,
            avatar_url: withAvatarFallback(
              r.user_id,
              profileByUser.get(r.user_id)?.avatar_url ?? null,
            ),
            total_score: totalScore,
            active_team_count: activeTeamCount,
            drafted_teams: draftedTeams,
            final_four_count: finalFourCount,
            championship_count: championshipCount,
            rank_delta: null,
          };
      });

      const rankedNow = rankRows(computed);

      // Rank movement is tracked round-to-round:
      // baseline = standings before the latest round that has at least one final winner.
      const completedRoundOrders = gameRows
        .filter((game) => Boolean(game.winner_team_id))
        .map((game) => ROUND_ORDER[game.round] ?? 0)
        .filter((order) => order > 0);
      const latestCompletedRoundOrder =
        completedRoundOrders.length > 0 ? Math.max(...completedRoundOrders) : 0;

      const priorRankByEntry = new Map<string, number>();
      if (latestCompletedRoundOrder > 0) {
        const priorGames: ScoringGame[] = gameRows.filter((game) => {
          if (!game.winner_team_id) return false;
          const order = ROUND_ORDER[game.round] ?? 0;
          return order > 0 && order < latestCompletedRoundOrder;
        });

        const priorScoredEntries = scoreEntries(priorGames, teamSeedById, picksByEntry);
        const priorRoundReachedByTeam = roundReachedOrderByTeam(priorGames);
        const priorComputed = baseRows.map((r) => {
          const entryTeamIds = Array.from(new Set(picksByEntry.get(r.entry_id) ?? []));
          const finalFourCount = entryTeamIds.reduce((sum, teamId) => {
            return sum + ((priorRoundReachedByTeam.get(teamId) ?? 0) >= ROUND_ORDER.F4 ? 1 : 0);
          }, 0);
          const championshipCount = entryTeamIds.reduce((sum, teamId) => {
            return sum + ((priorRoundReachedByTeam.get(teamId) ?? 0) >= ROUND_ORDER.CHIP ? 1 : 0);
          }, 0);

          return {
            entry_id: r.entry_id,
            display_name: r.display_name,
            entry_name: draftNameByEntry.get(r.entry_id) ?? null,
            total_score: priorScoredEntries.totalScoreByEntryId.get(r.entry_id) ?? 0,
            final_four_count: finalFourCount,
            championship_count: championshipCount,
          };
        });

        for (const row of rankRows(priorComputed)) {
          priorRankByEntry.set(row.entry_id, row.rank);
        }
      }

      const ranked: Row[] = rankedNow.map((row) => {
        const priorRank = priorRankByEntry.get(row.entry_id);
        const rank_delta = priorRank != null ? priorRank - row.rank : null;
        return { ...row, rank_delta };
      });

      const scenarioSeedRows: RankScenarioSeedRow[] = computed.map((row) => ({
        entry_id: row.entry_id,
        entry_name: row.entry_name,
        display_name: row.display_name,
        final_four_count: row.final_four_count,
        championship_count: row.championship_count,
        total_score: row.total_score,
      }));
      const myEntries = ranked
        .filter((row) => row.user_id === user.id)
        .sort((a, b) => a.rank - b.rank || b.total_score - a.total_score);
      const focusEntry = myEntries[0];
      const myEntryIds = myEntries.map((entry) => entry.entry_id);

      if (focusEntry && myEntryIds.length > 0) {
        const nowMs = Date.now();
        const todayEt = etDayKey(new Date());
        const unresolvedGames = gameRows
          .filter((game) => !game.winner_team_id && game.team1_id && game.team2_id)
          .sort((a, b) => {
            const roundDiff = (ROUND_ORDER[a.round] ?? 99) - (ROUND_ORDER[b.round] ?? 99);
            if (roundDiff !== 0) return roundDiff;
            const aTime = a.start_time ? Date.parse(a.start_time) : Number.POSITIVE_INFINITY;
            const bTime = b.start_time ? Date.parse(b.start_time) : Number.POSITIVE_INFINITY;
            return aTime - bTime;
          })
          .slice(0, 16);

        const nextRadar: RootingRadarItem[] = [];
        for (const game of unresolvedGames) {
          const team1Id = game.team1_id;
          const team2Id = game.team2_id;
          if (!team1Id || !team2Id) continue;

          const scenarioTeam1 = gameRows.map((row) =>
            row === game ? { ...row, winner_team_id: team1Id } : row,
          );
          const scenarioTeam2 = gameRows.map((row) =>
            row === game ? { ...row, winner_team_id: team2Id } : row,
          );

          const scoreTeam1 = scoreEntries(scenarioTeam1, teamSeedById, picksByEntry);
          const scoreTeam2 = scoreEntries(scenarioTeam2, teamSeedById, picksByEntry);

          const ranksTeam1 = rankMapForRows(
            scenarioSeedRows.map((row) => ({
              ...row,
              total_score: scoreTeam1.totalScoreByEntryId.get(row.entry_id) ?? 0,
            })),
          );
          const ranksTeam2 = rankMapForRows(
            scenarioSeedRows.map((row) => ({
              ...row,
              total_score: scoreTeam2.totalScoreByEntryId.get(row.entry_id) ?? 0,
            })),
          );

          const bestRankTeam1 = bestRankAcrossEntries(ranksTeam1, myEntryIds);
          const bestRankTeam2 = bestRankAcrossEntries(ranksTeam2, myEntryIds);
          if (bestRankTeam1 == null || bestRankTeam2 == null) continue;

          const team1Name =
            toSchoolDisplayName(teamMetaById.get(team1Id)?.name?.trim()) || "Team 1";
          const team2Name =
            toSchoolDisplayName(teamMetaById.get(team2Id)?.name?.trim()) || "Team 2";
          const team1FocusScore =
            scoreTeam1.totalScoreByEntryId.get(focusEntry.entry_id) ?? focusEntry.total_score;
          const team2FocusScore =
            scoreTeam2.totalScoreByEntryId.get(focusEntry.entry_id) ?? focusEntry.total_score;
          const recommendTeam1 = bestRankTeam1 <= bestRankTeam2;
          const preferredRank = recommendTeam1 ? bestRankTeam1 : bestRankTeam2;
          const alternateRank = recommendTeam1 ? bestRankTeam2 : bestRankTeam1;
          const preferredScore = recommendTeam1 ? team1FocusScore : team2FocusScore;
          const alternateScore = recommendTeam1 ? team2FocusScore : team1FocusScore;

          nextRadar.push({
            id: `${game.round}-${team1Id}-${team2Id}`,
            matchup: `${team1Name} vs ${team2Name}`,
            round: formatRoundLabel(game.round),
            game_state: gameHasStarted(game, nowMs, todayEt) ? "LIVE" : "UPCOMING",
            recommended_team: recommendTeam1 ? team1Name : team2Name,
            alternate_team: recommendTeam1 ? team2Name : team1Name,
            recommended_rank: preferredRank,
            alternate_rank: alternateRank,
            rank_swing: Math.abs(bestRankTeam1 - bestRankTeam2),
            focus_entry_label: formatEntryLabel(focusEntry),
            focus_score_swing: preferredScore - alternateScore,
          });
        }

        nextRadar.sort(
          (a, b) =>
            Number(b.game_state === "LIVE") - Number(a.game_state === "LIVE") ||
            b.rank_swing - a.rank_swing ||
            Math.abs(b.focus_score_swing) - Math.abs(a.focus_score_swing),
        );
        setRootingRadar(nextRadar.slice(0, 8));

        const nextSwingAlerts = nextRadar
          .filter((item) => item.rank_swing > 0 || Math.abs(item.focus_score_swing) >= 12)
          .slice(0, 5)
          .map((item) => ({
            id: item.id,
            summary: `${item.matchup}: root for ${item.recommended_team}`,
            detail:
              item.rank_swing > 0
                ? `${item.focus_entry_label} can move between #${item.recommended_rank} and #${item.alternate_rank}.`
                : `${item.focus_entry_label} gains a ${formatPointsDelta(item.focus_score_swing)} score edge if ${item.recommended_team} wins.`,
          }));
        setSwingAlerts(nextSwingAlerts);

        const focusPickSet = new Set(picksByEntry.get(focusEntry.entry_id) ?? []);
        const rivalryCandidates = ranked
          .filter((row) => row.user_id !== user.id)
          .sort(
            (a, b) =>
              Math.abs(focusEntry.total_score - a.total_score) -
                Math.abs(focusEntry.total_score - b.total_score) ||
              Math.abs(focusEntry.rank - a.rank) - Math.abs(focusEntry.rank - b.rank) ||
              a.rank - b.rank,
          )
          .slice(0, 2);

        const nextRivalryCards: RivalryCard[] = rivalryCandidates.map((rival) => {
          const rivalPickSet = new Set(picksByEntry.get(rival.entry_id) ?? []);
          const sharedActiveCount = focusEntry.drafted_teams.filter(
            (team) => team.is_active && rivalPickSet.has(team.team_id),
          ).length;
          const focusOnlyActive = activeTeamNames(focusEntry, rivalPickSet, 3);
          const rivalOnlyActive = activeTeamNames(rival, focusPickSet, 3);

          return {
            id: rival.entry_id,
            focus_entry_label: formatEntryLabel(focusEntry),
            rival_entry_label: formatEntryLabel(rival),
            score_gap: focusEntry.total_score - rival.total_score,
            focus_rank: focusEntry.rank,
            rival_rank: rival.rank,
            shared_active_count: sharedActiveCount,
            focus_only_active: focusOnlyActive,
            rival_only_active: rivalOnlyActive,
          };
        });

        setRivalryCards(nextRivalryCards);
      } else {
        setRootingRadar([]);
        setSwingAlerts([]);
        setRivalryCards([]);
      }

      const nextBreakdownByEntry: Record<string, EntryScoreBreakdown> = {};
      for (const row of ranked) {
        if (!isLocked && row.user_id !== user.id) continue;

        const pickedTeamIds = Array.from(new Set(picksByEntry.get(row.entry_id) ?? []));
        const draftedTeamById = new Map(row.drafted_teams.map((team) => [team.team_id, team]));

        const teamTotals: EntryBreakdownTeamTotal[] = pickedTeamIds
          .map((teamId) => {
            const drafted = draftedTeamById.get(teamId);
            const teamMeta = teamMetaById.get(teamId);
            return {
              team_id: teamId,
              team_name: toSchoolDisplayName(drafted?.team_name ?? teamMeta?.name?.trim()) || "Unknown team",
              seed: drafted?.seed ?? teamMeta?.seed_in_region ?? null,
              logo_url: drafted?.logo_url ?? teamMeta?.logo_url ?? null,
              points: teamScores.get(teamId) ?? 0,
            };
          })
          .sort(
            (a, b) =>
              b.points - a.points ||
              (a.seed ?? 99) - (b.seed ?? 99) ||
              a.team_name.localeCompare(b.team_name),
          );

        const events: EntryBreakdownEvent[] = [];
        for (const team of teamTotals) {
          const teamEvents = teamWinEventsByTeamId.get(team.team_id) ?? [];
          for (const event of teamEvents) {
            events.push({
              id: `${team.team_id}-${event.gameIndex}-${event.round}-${event.pointsAwarded}`,
              team_id: team.team_id,
              team_name: toSchoolDisplayName(team.team_name) || "Unknown team",
              seed: team.seed,
              logo_url: team.logo_url,
              round: event.round,
              opponent_seed: event.opponentSeed,
              base_points: event.basePoints,
              seed_multiplier: event.seedMultiplier,
              scaled_base_points: event.scaledBasePoints,
              upset_bonus: event.upsetBonus,
              historic_bonus: event.historicBonus,
              points_awarded: event.pointsAwarded,
              game_index: event.gameIndex,
            });
          }
        }

        events.sort(
          (a, b) =>
            a.game_index - b.game_index ||
            (ROUND_ORDER[a.round] ?? 99) - (ROUND_ORDER[b.round] ?? 99) ||
            b.points_awarded - a.points_awarded ||
            a.team_name.localeCompare(b.team_name),
        );

        const teamPoints = teamTotals.reduce((sum, team) => sum + team.points, 0);
        const perfectR64Bonus = scoredEntries.perfectR64BonusByEntryId.get(row.entry_id) ?? 0;
        const draftLabel = row.entry_name?.trim() || "Unnamed draft";
        const playerLabel = row.full_name?.trim() || row.display_name?.trim() || "Unnamed player";

        nextBreakdownByEntry[row.entry_id] = {
          entry_id: row.entry_id,
          draft_label: draftLabel,
          player_label: playerLabel,
          total_score: teamPoints + perfectR64Bonus,
          team_points: teamPoints,
          perfect_r64_bonus: perfectR64Bonus,
          team_totals: teamTotals,
          events,
        };
      }

      setExpandedTeamsByEntry({});
      setBreakdownByEntry(nextBreakdownByEntry);
      setOpenBreakdownEntryId((prev) => (prev && nextBreakdownByEntry[prev] ? prev : null));
      setRows(ranked);

      if (token) {
        try {
          const forecastRes = await fetch(
            `/api/pools/forecast?poolId=${encodeURIComponent(poolId)}`,
            {
              headers: {
                authorization: `Bearer ${token}`,
              },
              cache: "no-store",
            },
          );

          const forecastPayload = (await forecastRes.json().catch(() => ({}))) as {
            entries?: ForecastEntry[];
            generated_at?: string;
            horizon_round?: ForecastRoundCode;
            error?: string;
          };

          if (!forecastRes.ok) {
            throw new Error(
              apiErrorMessage(forecastPayload, "Forecast is temporarily unavailable."),
            );
          }

          const entries = Array.isArray(forecastPayload.entries)
            ? forecastPayload.entries
            : [];
          const nextForecastByEntry: Record<string, ForecastEntry> = {};
          for (const entry of entries) {
            nextForecastByEntry[entry.entry_id] = entry;
          }

          setForecastByEntry(nextForecastByEntry);
          setForecastUpdatedAt(forecastPayload.generated_at ?? null);
          setForecastHorizonRound(forecastPayload.horizon_round ?? null);
          setForecastMsg("");
        } catch (error: unknown) {
          setForecastMsg(
            error instanceof Error ? error.message : "Forecast is temporarily unavailable.",
          );
          if (!isBackgroundRefresh) {
            setForecastByEntry({});
            setForecastUpdatedAt(null);
            setForecastHorizonRound(null);
          }
        }
      } else if (!isBackgroundRefresh) {
        setForecastByEntry({});
        setForecastUpdatedAt(null);
        setForecastHorizonRound(null);
      }

      setLoading(false);
    };

    void load();
  }, [poolId, refreshTick]);

  const activeBreakdown =
    openBreakdownEntryId ? (breakdownByEntry[openBreakdownEntryId] ?? null) : null;
  const forecastModeOn = leaderboardMode === "forecast";
  const forecastHorizonLabel = forecastHorizonRound
    ? formatRoundLabel(forecastHorizonRound)
    : "current round";
  const poolSelectorValue = memberPools.some((pool) => pool.id === poolId) ? poolId : "";

  useEffect(() => {
    if (forecastModeOn && openBreakdownEntryId) {
      setOpenBreakdownEntryId(null);
    }
  }, [forecastModeOn, openBreakdownEntryId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(FEATURE_DRAWER_SEEN_KEY);
    setShowFeatureDrawerCallout(seen !== "1");
  }, []);

  useEffect(() => {
    if (!featuresDrawerOpen) return;
    setShowFeatureDrawerCallout(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FEATURE_DRAWER_SEEN_KEY, "1");
    }
  }, [featuresDrawerOpen]);

  const displayRows = useMemo(() => {
    if (!forecastModeOn || Object.keys(forecastByEntry).length === 0) {
      return rows.map((row) => ({
        row,
        forecast: forecastByEntry[row.entry_id] ?? null,
        displayRank: row.rank,
        displayScore: row.total_score,
      }));
    }

    const sorted = [...rows].sort((a, b) => {
      const scoreA = forecastByEntry[a.entry_id]?.expected_score ?? a.total_score;
      const scoreB = forecastByEntry[b.entry_id]?.expected_score ?? b.total_score;
      return (
        scoreB - scoreA ||
        (a.entry_name ?? a.display_name ?? "").localeCompare(
          b.entry_name ?? b.display_name ?? "",
        )
      );
    });

    let previousScore: number | null = null;
    let previousRank = 0;
    return sorted.map((row, index) => {
      const forecast = forecastByEntry[row.entry_id] ?? null;
      const displayScore = forecast?.expected_score ?? row.total_score;
      const scoreKey = Number(displayScore.toFixed(3));
      const rank = previousScore === scoreKey ? previousRank : index + 1;
      previousScore = scoreKey;
      previousRank = rank;

      return {
        row,
        forecast,
        displayRank: rank,
        displayScore,
      };
    });
  }, [forecastByEntry, forecastModeOn, rows]);

  return (
    <main className="page-shell" style={{ maxWidth: 1240 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 className="page-title" style={{ fontSize: 28, fontWeight: 900 }}>
          Leaderboard
        </h1>
        {memberPools.length > 0 ? (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
            <span style={{ fontSize: 13, opacity: 0.82 }}>Pool</span>
            <select
              value={poolSelectorValue}
              onChange={(event) => {
                const nextPoolId = event.target.value;
                if (!nextPoolId || nextPoolId === poolId) return;
                setStoredActivePoolId(nextPoolId);
                router.push(`/pool/${nextPoolId}/leaderboard`);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
                fontWeight: 700,
                minHeight: 38,
              }}
            >
              {!poolSelectorValue ? <option value="">Choose a pool</option> : null}
              {memberPools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {loading ? <p style={{ marginTop: 12 }}>Loading...</p> : null}
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
      {!loading && forecastModeOn && forecastMsg ? (
        <p style={{ marginTop: 12 }}>{forecastMsg}</p>
      ) : null}

      {!loading && !msg ? (
        <div className="leaderboard-layout" style={{ marginTop: 16 }}>
          <section>
            <div
              className="page-card"
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {!draftLocked ? (
                <div
                  style={{
                    padding: "10px 12px",
                    fontWeight: 700,
                    background: "var(--highlight)",
                    borderBottom: "1px solid var(--highlight-border)",
                  }}
                >
                  Other brackets are hidden until draft lock
                  {lockTime ? ` (${formatDraftLockTimeET(lockTime)})` : ""}.
                </div>
              ) : null}

              <div
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  display: "grid",
                  justifyItems: "center",
                  gap: 8,
                  textAlign: "center",
                }}
              >
                <div
                  role="tablist"
                  aria-label="Leaderboard view mode"
                  style={{
                    display: "inline-flex",
                    border: "1px solid var(--border-color)",
                    borderRadius: 9999,
                    padding: 3,
                    background: "var(--surface-muted)",
                    gap: 4,
                  }}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leaderboardMode === "live"}
                    onClick={() => setLeaderboardMode("live")}
                    style={{
                      border: "none",
                      borderRadius: 9999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      background:
                        leaderboardMode === "live" ? "var(--surface-elevated)" : "transparent",
                      color: "var(--foreground)",
                    }}
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leaderboardMode === "forecast"}
                    onClick={() => setLeaderboardMode("forecast")}
                    style={{
                      border: "none",
                      borderRadius: 9999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      background:
                        leaderboardMode === "forecast"
                          ? "var(--surface-elevated)"
                          : "transparent",
                      color: "var(--foreground)",
                    }}
                  >
                    Forecast
                  </button>
                </div>
                {forecastModeOn ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {forecastUpdatedAt
                        ? `Expected through ${forecastHorizonLabel} updated ${formatWhen(forecastUpdatedAt)}`
                        : "Expected outcomes are loading..."}
                    </div>
                    <button
                      type="button"
                      onClick={() => setForecastInfoOpen(true)}
                      style={{
                        border: "1px solid var(--border-color)",
                        borderRadius: 9999,
                        padding: "4px 9px",
                        fontSize: 12,
                        fontWeight: 800,
                        background: "var(--surface)",
                        color: "var(--foreground)",
                        cursor: "pointer",
                      }}
                    >
                      How forecast works
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px minmax(0, 1fr) 140px",
                  padding: "10px 12px",
                  fontWeight: 900,
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <div>{forecastModeOn ? "Proj Rank" : "Rank"}</div>
                <div>Player</div>
                <div style={{ textAlign: "right" }}>
                  {forecastModeOn ? "Expected" : "Score"}
                </div>
              </div>

              {displayRows.map(({ row: r, displayRank, displayScore }) => {
                const canOpenBracket = draftLocked || r.user_id === myUserId;
                const canViewTeams = draftLocked || r.user_id === myUserId;
                const canViewBreakdown = canViewTeams && Boolean(breakdownByEntry[r.entry_id]);
                const teamsExpanded = Boolean(expandedTeamsByEntry[r.entry_id]);
                const draftLabel = r.entry_name?.trim() || "Unnamed draft";
                const profileLabel =
                  r.full_name?.trim() || r.display_name?.trim() || "Unnamed player";

                return (
                  <div
                    key={r.entry_id}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      background:
                        r.user_id === myUserId
                          ? "var(--surface-elevated)"
                          : "transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "80px minmax(0, 1fr) 140px",
                        padding: "10px 12px",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{forecastModeOn ? displayRank : r.rank}</span>
                        {forecastModeOn ? (
                          <span
                            style={{
                              color: "var(--foreground)",
                              opacity: 0.7,
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            Live {r.rank}
                          </span>
                        ) : r.rank_delta != null ? (
                          <span
                            style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                            onMouseEnter={() => setHoveredMovementEntryId(r.entry_id)}
                            onMouseLeave={() =>
                              setHoveredMovementEntryId((prev) => (prev === r.entry_id ? null : prev))
                            }
                            onFocus={() => setHoveredMovementEntryId(r.entry_id)}
                            onBlur={() =>
                              setHoveredMovementEntryId((prev) => (prev === r.entry_id ? null : prev))
                            }
                            tabIndex={0}
                          >
                            {r.rank_delta > 0 ? (
                              <span style={{ color: "#15803d", fontSize: 13, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <svg
                                  aria-hidden="true"
                                  width="10"
                                  height="10"
                                  viewBox="0 0 10 10"
                                  style={{ display: "block" }}
                                >
                                  <path d="M5 0L10 9H0L5 0Z" fill="currentColor" />
                                </svg>
                                <span>{r.rank_delta}</span>
                              </span>
                            ) : r.rank_delta < 0 ? (
                              <span style={{ color: "#b91c1c", fontSize: 13, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <svg
                                  aria-hidden="true"
                                  width="10"
                                  height="10"
                                  viewBox="0 0 10 10"
                                  style={{ display: "block" }}
                                >
                                  <path d="M0 1H10L5 10L0 1Z" fill="currentColor" />
                                </svg>
                                <span>{Math.abs(r.rank_delta)}</span>
                              </span>
                            ) : (
                              <span style={{ color: "var(--foreground)", opacity: 0.6, fontSize: 13, fontWeight: 800 }}>
                                -
                              </span>
                            )}
                            {hoveredMovementEntryId === r.entry_id ? (
                              <span
                                role="tooltip"
                                style={{
                                  position: "absolute",
                                  left: "calc(100% + 8px)",
                                  bottom: "calc(100% + 8px)",
                                  transform: "none",
                                  width: 220,
                                  maxWidth: "min(220px, 80vw)",
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: "1px solid var(--border-color)",
                                  background: "var(--surface-elevated)",
                                  color: "var(--foreground)",
                                  fontSize: 12,
                                  lineHeight: 1.35,
                                  fontWeight: 700,
                                  whiteSpace: "normal",
                                  textAlign: "left",
                                  boxShadow: "0 8px 20px rgba(0,0,0,0.22)",
                                  zIndex: 20,
                                  pointerEvents: "none",
                                }}
                              >
                                Rank movement from the previous completed round to the latest completed round.
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontWeight: 800, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <img
                            src={r.avatar_url}
                            alt={profileLabel}
                            width={36}
                            height={36}
                            style={{
                              borderRadius: 9999,
                              objectFit: "cover",
                              border: "1px solid var(--border-color)",
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            {canOpenBracket ? (
                              <a
                                href={`/pool/${poolId}/bracket?entry=${r.entry_id}`}
                                style={{ textDecoration: "none", display: "block", minWidth: 0 }}
                              >
                                <div
                                  style={{
                                    fontWeight: 800,
                                    color: "var(--foreground)",
                                    fontSize: 17,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {draftLabel}
                                  {r.user_id === myUserId ? " (You)" : ""}
                                </div>
                                <div
                                  style={{
                                    color: "var(--foreground)",
                                    opacity: 0.72,
                                    fontSize: 13,
                                    marginTop: 2,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {profileLabel}
                                </div>
                              </a>
                            ) : (
                              <>
                                <div
                                  style={{
                                    fontWeight: 800,
                                    color: "var(--foreground)",
                                    fontSize: 17,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {draftLabel}
                                </div>
                                <div
                                  style={{
                                    color: "var(--foreground)",
                                    opacity: 0.72,
                                    fontSize: 13,
                                    marginTop: 2,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {profileLabel}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          display: "grid",
                          justifyItems: "end",
                          gap: 2,
                        }}
                      >
                        <div style={{ fontWeight: 900, fontSize: 18 }}>
                          {forecastModeOn ? formatExpectedScore(displayScore) : r.total_score}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            opacity: 0.78,
                          }}
                        >
                          {canViewTeams
                            ? `${r.active_team_count} alive`
                            : "Hidden"}
                        </div>
                        <button
                          type="button"
                          aria-expanded={teamsExpanded}
                          aria-controls={`entry-teams-${r.entry_id}`}
                          onClick={() => {
                            setExpandedTeamsByEntry((prev) => ({
                              ...prev,
                              [r.entry_id]: !prev[r.entry_id],
                            }));
                          }}
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
                          {teamsExpanded ? "Teams \u25B4" : "Teams \u25BE"}
                        </button>
                        {!forecastModeOn && canViewBreakdown ? (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenBreakdownEntryId(r.entry_id);
                            }}
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
                            Breakdown
                          </button>
                        ) : !forecastModeOn ? (
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            Breakdown hidden
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {teamsExpanded ? (
                      <div
                        id={`entry-teams-${r.entry_id}`}
                        style={{
                          borderTop: "1px solid var(--border-color)",
                          padding: "10px 12px",
                        }}
                      >
                        {!canViewTeams ? (
                          <div style={{ fontSize: 13, opacity: 0.78 }}>
                            Teams are hidden until draft lock.
                          </div>
                        ) : r.drafted_teams.length === 0 ? (
                          <div style={{ fontSize: 13, opacity: 0.78 }}>
                            No drafted teams found for this entry.
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {r.drafted_teams.map((team) => (
                              <div
                                key={team.team_id}
                                style={{
                                  border: "1px solid var(--border-color)",
                                  borderRadius: 9999,
                                  background: "var(--surface-muted)",
                                  padding: "6px 10px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  maxWidth: "100%",
                                  opacity: team.is_active ? 1 : 0.45,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {team.seed != null ? `#${team.seed} ` : ""}
                                  {toSchoolDisplayName(team.team_name)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {displayRows.length === 0 ? (
                <div style={{ padding: "12px 12px" }}>
                  No entries yet. Have friends join and draft.
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  void openArchive();
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Archive
              </button>
            </div>
          </section>

          <aside style={{ display: "grid", gap: 12 }}>
            {showTeamInsights ? (
              <>
                <TeamValueTable title="Best Value Teams" rows={bestValueTeams} />
                <TeamPopularityTable rows={popularTeams} />
              </>
            ) : (
              <section
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--surface)",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border-color)",
                    fontWeight: 900,
                    background: "var(--surface-muted)",
                  }}
                >
                  Team Insights
                </div>
                <div style={{ padding: "12px", opacity: 0.85 }}>
                  {!draftLocked
                    ? "Team value and popularity tables unlock after draft lock."
                    : "Best value and most popular teams appear once tournament games start."}
                </div>
              </section>
            )}
          </aside>
        </div>
      ) : null}

      {!loading && !msg ? (
        <div className="feature-drawer-root">
          {showFeatureDrawerCallout && !featuresDrawerOpen ? (
            <div className="feature-drawer-callout" role="status" aria-live="polite">
              <div style={{ fontWeight: 900 }}>New: Live Strategy Drawer</div>
              <div style={{ marginTop: 2, fontSize: 12, opacity: 0.85 }}>
                Try Rooting Radar, Swing Alerts, and Rivalry Engine.
              </div>
              <button
                type="button"
                onClick={() => setShowFeatureDrawerCallout(false)}
                style={{
                  marginTop: 6,
                  border: "1px solid var(--border-color)",
                  borderRadius: 9999,
                  padding: "4px 8px",
                  fontSize: 12,
                  fontWeight: 800,
                  background: "var(--surface)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="feature-drawer-shell" data-open={featuresDrawerOpen ? "true" : "false"}>
            <button
              type="button"
              aria-expanded={featuresDrawerOpen}
              aria-controls="leaderboard-feature-drawer"
              onClick={() => setFeaturesDrawerOpen((prev) => !prev)}
              className={`feature-drawer-tab ${
                !featuresDrawerOpen && showFeatureDrawerCallout ? "feature-drawer-tab--hint" : ""
              }`}
            >
              <span className="feature-drawer-tab-arrow">{featuresDrawerOpen ? ">" : "<"}</span>
              <span className="feature-drawer-tab-label">Live Edge</span>
            </button>

            <section id="leaderboard-feature-drawer" className="feature-drawer-panel">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--border-color)",
                  background: "var(--surface-muted)",
                }}
              >
                <div style={{ fontWeight: 900 }}>Live Edge</div>
                <button
                  type="button"
                  onClick={() => setFeaturesDrawerOpen(false)}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 9999,
                    padding: "4px 8px",
                    fontSize: 12,
                    fontWeight: 800,
                    background: "var(--surface)",
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{ padding: 10, display: "grid", gap: 10 }}>
                <section
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "var(--surface)",
                  }}
                >
                  <div
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid var(--border-color)",
                      fontWeight: 900,
                      fontSize: 13,
                      background: "var(--surface-muted)",
                    }}
                  >
                    Rooting Radar
                  </div>
                  {rootingRadar.length === 0 ? (
                    <div style={{ padding: "10px", opacity: 0.85, fontSize: 13 }}>
                      Rooting angles appear once matchups are available.
                    </div>
                  ) : (
                    <div style={{ display: "grid" }}>
                      {rootingRadar.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            borderTop: "1px solid var(--border-color)",
                            padding: "9px 10px",
                            display: "grid",
                            gap: 4,
                          }}
                        >
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.75 }}>
                              {item.round}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                border: "1px solid var(--border-color)",
                                borderRadius: 9999,
                                padding: "1px 7px",
                                fontWeight: 800,
                                opacity: 0.8,
                              }}
                            >
                              {item.game_state}
                            </span>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>{item.matchup}</div>
                          <div style={{ fontSize: 12, opacity: 0.92 }}>
                            Root for <b>{item.recommended_team}</b> (best path #{item.recommended_rank})
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "var(--surface)",
                  }}
                >
                  <div
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid var(--border-color)",
                      fontWeight: 900,
                      fontSize: 13,
                      background: "var(--surface-muted)",
                    }}
                  >
                    Swing Alerts
                  </div>
                  {swingAlerts.length === 0 ? (
                    <div style={{ padding: "10px", opacity: 0.85, fontSize: 13 }}>
                      No major swing windows right now.
                    </div>
                  ) : (
                    <div style={{ display: "grid" }}>
                      {swingAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          style={{
                            borderTop: "1px solid var(--border-color)",
                            padding: "9px 10px",
                            display: "grid",
                            gap: 4,
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: 13 }}>{alert.summary}</div>
                          <div style={{ fontSize: 12, opacity: 0.85 }}>{alert.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "var(--surface)",
                  }}
                >
                  <div
                    style={{
                      padding: "8px 10px",
                      borderBottom: "1px solid var(--border-color)",
                      fontWeight: 900,
                      fontSize: 13,
                      background: "var(--surface-muted)",
                    }}
                  >
                    Rivalry Engine
                  </div>
                  {rivalryCards.length === 0 ? (
                    <div style={{ padding: "10px", opacity: 0.85, fontSize: 13 }}>
                      Rivalry cards unlock when nearby opponents are visible.
                    </div>
                  ) : (
                    <div style={{ display: "grid" }}>
                      {rivalryCards.map((card) => (
                        <div
                          key={card.id}
                          style={{
                            borderTop: "1px solid var(--border-color)",
                            padding: "9px 10px",
                            display: "grid",
                            gap: 5,
                          }}
                        >
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            #{card.focus_rank} vs #{card.rival_rank}
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>{card.rival_entry_label}</div>
                          <div style={{ fontSize: 12, opacity: 0.9 }}>
                            {card.score_gap >= 0 ? "You lead by " : "You trail by "}
                            <b>{Math.abs(card.score_gap)}</b> points
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.8 }}>
                            Shared alive teams: {card.shared_active_count}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {forecastInfoOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Forecast info"
          onClick={() => setForecastInfoOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            padding: 16,
          }}
        >
          <section
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px, 96vw)",
              borderRadius: 14,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
                fontWeight: 900,
              }}
            >
              Forecast Basics
            </div>
            <div style={{ padding: "12px 14px", display: "grid", gap: 10, lineHeight: 1.5 }}>
              <p style={{ margin: 0 }}>
                Forecast view is a directional estimate of where standings may land by the end
                of {forecastHorizonLabel}.
              </p>
              <p style={{ margin: 0 }}>
                It blends current pool scores with live game context and matchup strength signals,
                then updates as games progress.
              </p>
              <p style={{ margin: 0, opacity: 0.82 }}>
                These numbers are not final standings and can move quickly with any upset.
              </p>
            </div>
            <div
              style={{
                padding: "10px 14px 14px 14px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setForecastInfoOpen(false)}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontWeight: 800,
                  background: "var(--surface)",
                  color: "var(--foreground)",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeBreakdown ? (
        <div
          role="presentation"
          onClick={() => setOpenBreakdownEntryId(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 125,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${activeBreakdown.draft_label} scoring breakdown`}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>
                  {activeBreakdown.draft_label} Breakdown
                </h2>
                <div style={{ marginTop: 4, opacity: 0.8, fontWeight: 700 }}>
                  {activeBreakdown.player_label}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenBreakdownEntryId(null)}
                style={{
                  padding: "8px 11px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 9999,
                  padding: "6px 10px",
                  fontWeight: 800,
                }}
              >
                Total: {activeBreakdown.total_score}
              </div>
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 9999,
                  padding: "6px 10px",
                  fontWeight: 700,
                  opacity: 0.9,
                }}
              >
                Team points: {activeBreakdown.team_points}
              </div>
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 9999,
                  padding: "6px 10px",
                  fontWeight: 700,
                  opacity: 0.9,
                }}
              >
                Perfect R64 bonus: {activeBreakdown.perfect_r64_bonus}
              </div>
            </div>

            <section
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--border-color)",
                  background: "var(--surface-muted)",
                  fontWeight: 900,
                }}
              >
                Team Totals
              </div>
              {activeBreakdown.team_totals.length === 0 ? (
                <div style={{ padding: "12px", opacity: 0.8 }}>No drafted teams found.</div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px",
                      gap: 8,
                      padding: "9px 12px",
                      borderBottom: "1px solid var(--border-color)",
                      fontWeight: 800,
                    }}
                  >
                    <div>Team</div>
                    <div style={{ textAlign: "right" }}>Points</div>
                  </div>
                  {activeBreakdown.team_totals.map((team) => (
                    <div
                      key={team.team_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 100px",
                        gap: 8,
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--border-color)",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {team.seed != null ? `#${team.seed} ` : ""}
                          {toSchoolDisplayName(team.team_name)}
                        </span>
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 900 }}>{team.points}</div>
                    </div>
                  ))}
                </>
              )}
            </section>

            <section
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--border-color)",
                  background: "var(--surface-muted)",
                  fontWeight: 900,
                }}
              >
                Scoring Events
              </div>
              {activeBreakdown.events.length === 0 && activeBreakdown.perfect_r64_bonus <= 0 ? (
                <div style={{ padding: "12px", opacity: 0.8 }}>
                  No points scored yet for this draft.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 110px 80px",
                      gap: 8,
                      padding: "9px 12px",
                      borderBottom: "1px solid var(--border-color)",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    <div>Team</div>
                    <div>Round</div>
                    <div style={{ textAlign: "right" }}>Points</div>
                  </div>
                  {activeBreakdown.events.map((event) => (
                    <div
                      key={event.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 110px 80px",
                        gap: 8,
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--border-color)",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {event.seed != null ? `#${event.seed} ` : ""}
                          {toSchoolDisplayName(event.team_name)}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700 }}>{formatRoundLabel(event.round)}</div>
                      <div style={{ textAlign: "right", fontWeight: 900 }}>
                        {formatPointsDelta(event.points_awarded)}
                      </div>
                    </div>
                  ))}
                  {activeBreakdown.perfect_r64_bonus > 0 ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 110px 80px",
                        gap: 8,
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--border-color)",
                        alignItems: "center",
                        background: "var(--surface-muted)",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>Perfect R64 Bonus</div>
                      <div style={{ fontWeight: 700 }}>Bonus</div>
                      <div style={{ textAlign: "right", fontWeight: 900 }}>
                        {formatPointsDelta(activeBreakdown.perfect_r64_bonus)}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {archiveOpen ? (
        <div
          role="presentation"
          onClick={() => setArchiveOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 120,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pool archive"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              borderRadius: 12,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Pool Archive</h2>
              <button
                type="button"
                onClick={() => setArchiveOpen(false)}
                style={{
                  padding: "8px 11px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <p style={{ margin: 0, opacity: 0.8 }}>
              Open any season to view final standings and your drafted teams/results.
            </p>

            {isPoolOwner ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    void saveCurrentSeasonArchive();
                  }}
                  disabled={archiveSaving}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-color)",
                    background: "var(--surface)",
                    fontWeight: 800,
                    cursor: archiveSaving ? "default" : "pointer",
                    opacity: archiveSaving ? 0.65 : 1,
                  }}
                >
                  {archiveSaving ? "Saving..." : `Save ${currentSeason} Final Snapshot`}
                </button>
                {archiveSaveMsg ? <span style={{ fontWeight: 700 }}>{archiveSaveMsg}</span> : null}
              </div>
            ) : null}

            {archiveLoading ? <p style={{ margin: 0 }}>Loading archive years...</p> : null}
            {archiveMsg ? <p style={{ margin: 0 }}>{archiveMsg}</p> : null}

            {archiveYears.length > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {archiveYears.map((seasonRow) => (
                  <button
                    key={seasonRow.season}
                    type="button"
                    onClick={() => {
                      void loadArchiveSeason(seasonRow.season);
                    }}
                    style={{
                      padding: "9px 12px",
                      borderRadius: 10,
                      border: "1px solid var(--border-color)",
                      background:
                        archiveSeason === seasonRow.season
                          ? "var(--surface-elevated)"
                          : "var(--surface)",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {seasonRow.season}
                  </button>
                ))}
              </div>
            ) : null}

            {archiveDetailLoading ? <p style={{ margin: 0 }}>Loading season results...</p> : null}

            {archiveDetail ? (
              <section
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border-color)",
                    background: "var(--surface-muted)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    {archiveDetail.season} Final Standings
                  </div>
                  <div style={{ opacity: 0.75, fontSize: 13 }}>
                    Captured: {formatWhen(archiveDetail.updated_at)}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px minmax(0, 1fr) 130px",
                    padding: "9px 12px",
                    borderBottom: "1px solid var(--border-color)",
                    fontWeight: 900,
                  }}
                >
                  <div>Rank</div>
                  <div>Player</div>
                  <div style={{ textAlign: "right" }}>Score</div>
                </div>

                {archiveDetail.snapshot.entries.map((entry) => (
                  <div
                    key={entry.entry_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px minmax(0, 1fr) 130px",
                      padding: "10px 12px",
                      borderBottom: "1px solid var(--border-color)",
                      alignItems: "center",
                      background:
                        myUserId && entry.user_id === myUserId
                          ? "var(--surface-elevated)"
                          : "transparent",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{entry.rank}</div>
                    <div
                      style={{
                        fontWeight: 800,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {entry.entry_name ?? entry.full_name ?? entry.display_name ?? entry.user_id.slice(0, 8)}
                      {myUserId && entry.user_id === myUserId ? " (You)" : ""}
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 900 }}>{entry.total_score}</div>
                  </div>
                ))}

                {archiveDetail.snapshot.entries.length === 0 ? (
                  <div style={{ padding: "12px" }}>No archived entries for this season.</div>
                ) : null}
              </section>
            ) : null}

            {archiveDetail?.my_entry ? (
              <section
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--border-color)",
                    background: "var(--surface-muted)",
                    fontWeight: 900,
                  }}
                >
                  Your Drafted Teams - {archiveDetail.season}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px 1fr 170px 120px",
                    padding: "9px 12px",
                    borderBottom: "1px solid var(--border-color)",
                    fontWeight: 900,
                  }}
                >
                  <div>Seed</div>
                  <div>Team</div>
                  <div>Result</div>
                  <div style={{ textAlign: "right" }}>Points</div>
                </div>

                {archiveDetail.my_entry.drafted_teams.map((team) => (
                  <div
                    key={team.team_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 170px 120px",
                      padding: "10px 12px",
                      borderBottom: "1px solid var(--border-color)",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{team.seed ?? "-"}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 800 }}>{toSchoolDisplayName(team.team_name)}</div>
                    </div>
                    <div style={{ opacity: 0.85 }}>{formatArchiveRound(team.round_reached)}</div>
                    <div style={{ textAlign: "right", fontWeight: 900 }}>{team.total_team_score}</div>
                  </div>
                ))}

                {archiveDetail.my_entry.drafted_teams.length === 0 ? (
                  <div style={{ padding: "12px" }}>No drafted teams saved for your entry this season.</div>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
