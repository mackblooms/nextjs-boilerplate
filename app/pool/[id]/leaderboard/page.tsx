"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { setStoredActivePoolId } from "../../../../lib/activePool";
import { supabase } from "../../../../lib/supabaseClient";
import { withAvatarFallback } from "../../../../lib/avatar";
import { formatDraftLockTimeET, isDraftLocked, resolveDraftLockTime } from "../../../../lib/draftLock";
import { buildPoolInviteShareData, getInvitePoolIdFromNextPath } from "../../../../lib/poolInvite";
import {
  scoreEntries,
  scoreTeamWinsDetailed,
  type ScoringGame,
} from "../../../../lib/scoring";
import { toSchoolDisplayName } from "../../../../lib/teamNames";
import { applyLiveScoreOverlay, type LiveOverlayScoreGame } from "@/lib/liveBracket";
import { competitionPath, normalizeCompetitionSlug, type CompetitionSlug } from "@/lib/competitions";
import { canUseLegacyMarchMadnessFallback } from "@/lib/competitionData";
import { fetchCompetitionSnapshot } from "@/lib/competitionSnapshot";
import { getEliminatedTeamIds } from "@/lib/teamElimination";
import { worldCupLogoUrl } from "@/lib/worldCupLogos";
import WorldCupTeamLabel, { WorldCupLogoChip } from "@/app/components/WorldCupTeamLabel";
import {
  UiButton,
  UiEmptyState,
  UiErrorState,
  UiLinkButton,
  UiLoadingState,
  UiStatus,
  UiTooltip,
} from "@/app/components/ui/primitives";

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

type BaseLeaderboardRow = Pick<Row, "entry_id" | "user_id" | "display_name">;

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
  id: string;
  region: string | null;
  slot: number;
  game_date: string | null;
  start_time: string | null;
};
type LiveScoresResponse = {
  ok: boolean;
  games?: LiveOverlayScoreGame[];
  error?: string;
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

type TeamInsightsModal = "value" | "popularity" | null;

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
  first_place_probability: number;
};

type ForecastRoundCode = "R64" | "R32" | "S16" | "E8" | "F4" | "CHIP";

const ROUND_ORDER: Record<string, number> = {
  R64: 1,
  R32: 2,
  S16: 3,
  E8: 4,
  F4: 5,
  CHIP: 6,
};
const LEADERBOARD_REFRESH_MS = 60_000;

function isMissingAvatarColumnError(error: { message?: string; code?: string } | null) {
  return Boolean(
    error?.code === "PGRST204" &&
      error.message?.includes("profiles") &&
      error.message.includes("avatar_url"),
  );
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
  if (typeof game.team1_score === "number" || typeof game.team2_score === "number") return true;
  const status = String(game.status ?? "").trim().toLowerCase();
  if (
    status.startsWith("final") ||
    status === "ft" ||
    status === "full time" ||
    status === "full-time" ||
    status === "post" ||
    status.startsWith("complete")
  ) {
    return true;
  }

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

function formatTeamLabel(name: string, seed: number | null, competitionSlug: CompetitionSlug) {
  const displayName = toSchoolDisplayName(name);
  if (competitionSlug === "world-cup") return displayName;
  return `${seed != null ? `#${seed} ` : ""}${displayName}`;
}

function formatExpectedScore(value: number) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value - Math.round(value)) < 0.05) return String(Math.round(value));
  return value.toFixed(1);
}

function ExplainedValue({
  children,
  description,
  side = "right",
}: {
  children: ReactNode;
  description: ReactNode;
  side?: "left" | "right";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(event) => {
        event.stopPropagation();
        setOpen((prev) => !prev);
      }}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
        cursor: "help",
        outline: "none",
      }}
    >
      <span
        style={{
          borderBottom: "1px dotted currentColor",
          textUnderlineOffset: 3,
        }}
      >
        {children}
      </span>
      {open ? (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            ...(side === "left" ? { right: 0 } : { left: 0 }),
            width: 250,
            maxWidth: "min(250px, 78vw)",
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
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          {description}
        </span>
      ) : null}
    </span>
  );
}

function TeamValueTable({
  title,
  rows,
  totalRows,
  onViewAll,
}: {
  title: string;
  rows: TeamValueRow[];
  totalRows?: number;
  onViewAll?: () => void;
}) {
  const hiddenCount = Math.max((totalRows ?? rows.length) - rows.length, 0);

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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>{title}</span>
        {onViewAll && hiddenCount > 0 ? (
          <button
            type="button"
            onClick={onViewAll}
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              background: "var(--surface)",
              color: "var(--foreground)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
              padding: "4px 8px",
            }}
          >
            View all
          </button>
        ) : null}
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
              letterSpacing: 0,
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
                <WorldCupLogoChip name={row.team_name} logoUrl={row.logo_url} />
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

function TeamPopularityTable({
  rows,
  totalRows,
  onViewAll,
}: {
  rows: TeamPopularityRow[];
  totalRows?: number;
  onViewAll?: () => void;
}) {
  const hiddenCount = Math.max((totalRows ?? rows.length) - rows.length, 0);

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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>Most Popular Teams</span>
        {onViewAll && hiddenCount > 0 ? (
          <button
            type="button"
            onClick={onViewAll}
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              background: "var(--surface)",
              color: "var(--foreground)",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
              padding: "4px 8px",
            }}
          >
            View all
          </button>
        ) : null}
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
              letterSpacing: 0,
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
                <WorldCupLogoChip name={row.team_name} logoUrl={row.logo_url} />
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
  const redirectingToLoginRef = useRef(false);
  const [isCompact, setIsCompact] = useState(false);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [memberPools, setMemberPools] = useState<PoolOption[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draftLocked, setDraftLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);
  const [isPoolOwner, setIsPoolOwner] = useState(false);
  const [deletingPool, setDeletingPool] = useState(false);
  const [showTeamInsights, setShowTeamInsights] = useState(false);
  const [bestValueTeams, setBestValueTeams] = useState<TeamValueRow[]>([]);
  const [allValueTeams, setAllValueTeams] = useState<TeamValueRow[]>([]);
  const [popularTeams, setPopularTeams] = useState<TeamPopularityRow[]>([]);
  const [allPopularTeams, setAllPopularTeams] = useState<TeamPopularityRow[]>([]);
  const [teamInsightsModal, setTeamInsightsModal] = useState<TeamInsightsModal>(null);
  const [breakdownByEntry, setBreakdownByEntry] = useState<Record<string, EntryScoreBreakdown>>({});
  const [openBreakdownEntryId, setOpenBreakdownEntryId] = useState<string | null>(null);
  const [expandedBreakdownTeamIds, setExpandedBreakdownTeamIds] = useState<Set<string>>(new Set());
  const [hoveredMovementEntryId, setHoveredMovementEntryId] = useState<string | null>(null);
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>("live");
  const [forecastByEntry, setForecastByEntry] = useState<Record<string, ForecastEntry>>({});
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState<string | null>(null);
  const [forecastHorizonRound, setForecastHorizonRound] = useState<ForecastRoundCode | null>(null);
  const [forecastBuild, setForecastBuild] = useState<string | null>(null);
  const [forecastWorldCupChampionshipRouting, setForecastWorldCupChampionshipRouting] = useState<boolean | null>(null);
  const [forecastMsg, setForecastMsg] = useState("");
  const [forecastInfoOpen, setForecastInfoOpen] = useState(false);
  const [poolCompetitionSlug, setPoolCompetitionSlug] = useState<CompetitionSlug>("march-madness");

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

  const redirectToLogin = useCallback(() => {
    if (redirectingToLoginRef.current) return;
    redirectingToLoginRef.current = true;

    const fallbackPath = `/pool/${poolId}/leaderboard`;
    const nextPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : fallbackPath;
    const safeNextPath = nextPath.startsWith("/") ? nextPath : fallbackPath;
    const params = new URLSearchParams({ next: safeNextPath });
    const invitePoolId = getInvitePoolIdFromNextPath(safeNextPath);
    if (invitePoolId) {
      params.set("invitePoolId", invitePoolId);
    }

    router.replace(`/login?${params.toString()}`);
  }, [poolId, router]);

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadArchiveSeason(season: number) {
    const token = await getAccessToken();
    if (!token) {
      setArchiveMsg("Session expired. Redirecting to login...");
      redirectToLogin();
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
      setArchiveMsg("Session expired. Redirecting to login...");
      redirectToLogin();
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
      setArchiveSaveMsg("Session expired. Redirecting to login...");
      redirectToLogin();
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
        setAllValueTeams([]);
        setPopularTeams([]);
        setAllPopularTeams([]);
        setTeamInsightsModal(null);
        setBreakdownByEntry({});
        setOpenBreakdownEntryId(null);
        setForecastByEntry({});
        setForecastUpdatedAt(null);
        setForecastHorizonRound(null);
        setForecastBuild(null);
        setForecastWorldCupChampionshipRouting(null);
      }
      setMsg("");
      setForecastMsg("");

      let liveScoreGames: LiveOverlayScoreGame[] = [];
      try {
        let { data: scorePoolRow, error: scorePoolErr } = await supabase
          .from("pools")
          .select("competition_slug")
          .eq("id", poolId)
          .maybeSingle();
        if (canUseLegacyMarchMadnessFallback("march-madness", scorePoolErr?.message)) {
          scorePoolRow = null;
          scorePoolErr = null;
        }
        const scoreCompetitionSlug = normalizeCompetitionSlug(scorePoolRow?.competition_slug);
        const liveRes = await fetch(
          `/api/scores/live?lookbackDays=30&lookaheadDays=0&competition=${scoreCompetitionSlug}`,
          { cache: "no-store" },
        );
        const livePayload = (await liveRes.json().catch(() => ({}))) as LiveScoresResponse;
        if (liveRes.ok && livePayload.ok) {
          liveScoreGames = livePayload.games ?? [];
        }
      } catch {
        // Live scores may be temporarily unavailable; continue loading leaderboard data.
      }

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setMemberPools([]);
        setMsg("Session expired. Redirecting to login...");
        setLoading(false);
        redirectToLogin();
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

      let { data: poolRow, error: poolErr } = await supabase
        .from("pools")
        .select("name,lock_time,created_by,competition_slug")
        .eq("id", poolId)
        .single();

      if (canUseLegacyMarchMadnessFallback("march-madness", poolErr?.message)) {
        const fallback = await supabase
          .from("pools")
          .select("name,lock_time,created_by")
          .eq("id", poolId)
          .single();
        poolRow = fallback.data ? { ...fallback.data, competition_slug: null } : null;
        poolErr = fallback.error;
      }

      if (poolErr) {
        setMsg(poolErr.message);
        setLoading(false);
        return;
      }

      const competitionSlug = normalizeCompetitionSlug(poolRow?.competition_slug);
      setPoolCompetitionSlug(competitionSlug);
      const resolvedLockTime = resolveDraftLockTime(poolRow?.lock_time ?? null, competitionSlug);
      const isLocked = isDraftLocked(poolRow?.lock_time ?? null, new Date(), competitionSlug);
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

      const baseRows = (data ?? []) as BaseLeaderboardRow[];
      let activeBaseRows = baseRows;
      let entryIds = activeBaseRows.map((r) => r.entry_id);
      let latestPicksByEntry: Record<string, string[]> | null = null;

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
              entries?: Array<{
                entry_id: string;
                user_id: string;
                display_name: string | null;
              }>;
              picksByEntry?: Record<string, string[]>;
            };
            if (Array.isArray(payload.entries)) {
              activeBaseRows = payload.entries.map((entry) => ({
                entry_id: entry.entry_id,
                user_id: entry.user_id,
                display_name: entry.display_name,
              }));
              entryIds = activeBaseRows.map((entry) => entry.entry_id);
            }
            latestPicksByEntry = payload.picksByEntry ?? null;
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

      const userIds = Array.from(new Set(activeBaseRows.map((r) => r.user_id)));
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

      let snapshot;
      try {
        snapshot = await fetchCompetitionSnapshot(competitionSlug);
      } catch (error) {
        setMsg(error instanceof Error ? error.message : "Unable to load competition data.");
        setLoading(false);
        return;
      }

      const teamRowsList = snapshot.teams as TeamSeedRow[];
      const teamSeedById = new Map(teamRowsList.map((t) => [t.id, t.seed_in_region]));
      const teamCostById = new Map(teamRowsList.map((t) => [t.id, t.cost ?? null]));

      let gameRows = snapshot.games as ScoringGameWithDate[];

      gameRows = applyLiveScoreOverlay(gameRows, teamRowsList, liveScoreGames).map((game) => ({
        ...game,
        game_date: game.game_date ?? null,
        start_time: game.start_time ?? null,
      }));

      let picksByEntry = new Map<string, string[]>();

      const gameTeamIds = new Set<string>();
      for (const game of gameRows) {
        if (game.team1_id) gameTeamIds.add(game.team1_id);
        if (game.team2_id) gameTeamIds.add(game.team2_id);
        if (game.winner_team_id) gameTeamIds.add(game.winner_team_id);
      }

      if (latestPicksByEntry) {
        picksByEntry = new Map(
          Object.entries(latestPicksByEntry).map(([entryId, teamIds]) => [
            entryId,
            Array.isArray(teamIds) ? teamIds.map(String) : [],
          ]),
        );
      } else if (entryIds.length > 0) {
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

      const eliminatedTeamIds = getEliminatedTeamIds(gameRows, competitionSlug);

      const scoredEntries = scoreEntries(gameRows, teamSeedById, picksByEntry, {
        competitionSlug,
        teamCostById,
      });
      const teamScores = scoredEntries.teamScoresByTeamId;
      const teamWinScoring = scoreTeamWinsDetailed(gameRows, teamSeedById, {
        competitionSlug,
        teamCostById,
      });
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
        for (const teamMeta of teamRowsList) {
          if (!gameTeamIds.has(teamMeta.id) && competitionSlug !== "world-cup") continue;
          const selections = selectionCountByTeam.get(teamMeta.id) ?? 0;
          const teamName = toSchoolDisplayName(teamMeta?.name?.trim()) || "Unknown team";
          const logoUrl = worldCupLogoUrl(teamMeta?.name ?? teamName, teamMeta?.logo_url);
          popularityRows.push({
            team_id: teamMeta.id,
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

        const allValueRows: TeamValueRow[] = [];
        for (const teamMeta of teamRowsList) {
          if (!gameTeamIds.has(teamMeta.id) && competitionSlug !== "world-cup") continue;
          const teamName = toSchoolDisplayName(teamMeta?.name?.trim()) || "Unknown team";
          const logoUrl = worldCupLogoUrl(teamMeta?.name ?? teamName, teamMeta?.logo_url);
          const cost = teamMeta?.cost;
          if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) continue;

          const points = teamScores.get(teamMeta.id) ?? 0;
          allValueRows.push({
            team_id: teamMeta.id,
            team_name: teamName,
            logo_url: logoUrl,
            cost,
            points,
            roi: points / cost,
          });
        }

        const sortedValueRows = [...allValueRows].sort(
          (a, b) =>
            b.roi - a.roi ||
            b.points - a.points ||
            a.team_name.localeCompare(b.team_name),
        );
        const bestRows = sortedValueRows
          .filter((row) => startedTeamIds.has(row.team_id))
          .slice(0, BEST_WORST_LIMIT);

        const sortedPopularityRows = [...popularityRows].sort(
          (a, b) =>
            b.selections - a.selections ||
            a.team_name.localeCompare(b.team_name),
        );
        const popularRows = sortedPopularityRows.slice(0, POPULAR_LIMIT);

        setShowTeamInsights(true);
        setBestValueTeams(bestRows);
        setAllValueTeams(sortedValueRows);
        setPopularTeams(popularRows);
        setAllPopularTeams(sortedPopularityRows);
      } else {
        setShowTeamInsights(false);
        setBestValueTeams([]);
        setAllValueTeams([]);
        setPopularTeams([]);
        setAllPopularTeams([]);
        setTeamInsightsModal(null);
      }

      const computed = activeBaseRows
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
                logo_url: worldCupLogoUrl(
                  teamMeta?.name ?? null,
                  teamMeta?.logo_url ?? aliasMeta?.logo_url ?? null,
                ),
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

        const priorScoredEntries = scoreEntries(priorGames, teamSeedById, picksByEntry, {
          competitionSlug,
          teamCostById,
        });
        const priorRoundReachedByTeam = roundReachedOrderByTeam(priorGames);
        const priorComputed = activeBaseRows.map((r) => {
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
              logo_url: worldCupLogoUrl(
                drafted?.team_name ?? teamMeta?.name ?? null,
                drafted?.logo_url ?? teamMeta?.logo_url ?? null,
              ),
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
            forecast_build?: string;
            world_cup_championship_routing?: boolean | null;
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
          setForecastBuild(forecastPayload.forecast_build ?? null);
          setForecastWorldCupChampionshipRouting(
            typeof forecastPayload.world_cup_championship_routing === "boolean"
              ? forecastPayload.world_cup_championship_routing
              : null,
          );
          setForecastMsg("");
        } catch (error: unknown) {
          setForecastMsg(
            error instanceof Error ? error.message : "Forecast is temporarily unavailable.",
          );
          if (!isBackgroundRefresh) {
            setForecastByEntry({});
            setForecastUpdatedAt(null);
            setForecastHorizonRound(null);
            setForecastBuild(null);
            setForecastWorldCupChampionshipRouting(null);
          }
        }
      } else if (!isBackgroundRefresh) {
        setForecastByEntry({});
        setForecastUpdatedAt(null);
        setForecastHorizonRound(null);
        setForecastBuild(null);
        setForecastWorldCupChampionshipRouting(null);
      }

      setLoading(false);
    };

    void load();
  }, [poolId, refreshTick, redirectToLogin]);

  const activeBreakdown =
    openBreakdownEntryId ? (breakdownByEntry[openBreakdownEntryId] ?? null) : null;
  const activeEntryRow =
    openBreakdownEntryId ? rows.find((row) => row.entry_id === openBreakdownEntryId) ?? null : null;
  const activeEventsByTeamId = useMemo(() => {
    const next = new Map<string, EntryBreakdownEvent[]>();
    for (const event of activeBreakdown?.events ?? []) {
      const current = next.get(event.team_id) ?? [];
      current.push(event);
      next.set(event.team_id, current);
    }
    return next;
  }, [activeBreakdown]);
  const forecastModeOn = leaderboardMode === "forecast";
  const leaderboardGridTemplate = isCompact
    ? "64px minmax(0, 1fr) 88px"
    : "80px minmax(0, 1fr) 140px";

  useEffect(() => {
    setExpandedBreakdownTeamIds(new Set());
  }, [openBreakdownEntryId]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 720px)");
    const sync = () => setIsCompact(media.matches);
    sync();

    const onChange = (event: MediaQueryListEvent) => {
      setIsCompact(event.matches);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);
  const forecastHorizonLabel = forecastHorizonRound
    ? formatRoundLabel(forecastHorizonRound)
    : "the tournament";
  const poolSelectorValue = memberPools.some((pool) => pool.id === poolId) ? poolId : "";
  const activePoolName = memberPools.find((pool) => pool.id === poolId)?.name ?? "";
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function sharePoolInvite() {
    if (draftLocked) {
      setMsg("Invites are closed after draft lock.");
      return;
    }

    const shareData = buildPoolInviteShareData(poolId, activePoolName, true);

    if (canNativeShare) {
      try {
        await navigator.share({
          title: shareData.title,
          text: shareData.text,
          url: shareData.url,
        });
        setMsg("Invite ready to send.");
        return;
      } catch (error) {
        const isAbortError = error instanceof DOMException && error.name === "AbortError";
        if (isAbortError) return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareData.url);
      setMsg(shareData.copyLabel);
    } catch {
      setMsg(`Copy this invite link: ${shareData.url}`);
    }
  }

  async function deletePool() {
    if (draftLocked) return;
    if (deletingPool) return;

    const ok = window.confirm(
      `Delete "${activePoolName || "this pool"}" permanently? This removes all pool entries, picks, and member access.`,
    );
    if (!ok) return;

    setDeletingPool(true);
    setMsg("");

    const token = await getAccessToken();
    if (!token) {
      setDeletingPool(false);
      setMsg("Session expired. Redirecting to login...");
      redirectToLogin();
      return;
    }

    const res = await fetch("/api/pools/delete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ poolId }),
    });

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setDeletingPool(false);
      setMsg(body.error ?? "Failed to delete pool.");
      return;
    }

    router.push(competitionPath("/pools", poolCompetitionSlug));
  }

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
      const rankA = forecastByEntry[a.entry_id]?.expected_rank ?? a.rank;
      const rankB = forecastByEntry[b.entry_id]?.expected_rank ?? b.rank;
      const scoreA = forecastByEntry[a.entry_id]?.expected_score ?? a.total_score;
      const scoreB = forecastByEntry[b.entry_id]?.expected_score ?? b.total_score;
      return (
        rankA - rankB ||
        scoreB - scoreA ||
        (a.entry_name ?? a.display_name ?? "").localeCompare(
          b.entry_name ?? b.display_name ?? "",
        )
      );
    });

    return sorted.map((row) => {
      const forecast = forecastByEntry[row.entry_id] ?? null;
      const displayScore = forecast?.expected_score ?? row.total_score;

      return {
        row,
        forecast,
        displayRank: forecast ? Number(forecast.expected_rank.toFixed(1)) : row.rank,
        displayScore,
      };
    });
  }, [forecastByEntry, forecastModeOn, rows]);

  return (
    <main className="page-shell" style={{ maxWidth: 1240 }}>
      <section
        className="leaderboard-hero"
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 18,
          background: "linear-gradient(180deg, var(--surface-elevated), var(--surface))",
          boxShadow: "var(--shadow-sm)",
          padding: isCompact ? "14px 12px" : "16px 16px",
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0,
              opacity: 0.62,
            }}
          >
            Pool leaderboard
          </div>
          <h1 className="page-title" style={{ fontSize: isCompact ? 26 : 30, fontWeight: 900, margin: 0 }}>
            {activePoolName || "Leaderboard"}
          </h1>
          <p style={{ margin: 0, opacity: 0.78, fontSize: 14 }}>
            Rankings, scores, and pool movement all in one place.
          </p>
        </div>

        <div className="leaderboard-hero-controls">
          {memberPools.length > 0 ? (
            <label className="leaderboard-hero-control" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
              <span style={{ fontSize: 13, opacity: 0.82 }}>Pool</span>
              <select
                value={poolSelectorValue}
                onChange={(event) => {
                  const nextPoolId = event.target.value;
                  if (!nextPoolId || nextPoolId === poolId) return;
                  setStoredActivePoolId(nextPoolId);
                  router.push(`/pool/${nextPoolId}/leaderboard`);
                }}
                className="ui-control ui-select"
                style={{
                  minHeight: 38,
                  minWidth: isCompact ? 0 : 200,
                  width: "100%",
                  background: "var(--surface)",
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
          {!draftLocked ? (
            <UiTooltip content="share or copy an invite link">
              <button
                className="leaderboard-hero-share ui-btn ui-btn--md ui-btn--primary"
                type="button"
                onClick={() => void sharePoolInvite()}
              >
                Share Invite
              </button>
            </UiTooltip>
          ) : null}
          {isPoolOwner && !draftLocked ? (
            <UiTooltip content={deletingPool ? "deleting pool" : "permanently delete this pool"}>
              <button
                className="leaderboard-hero-share ui-btn ui-btn--md ui-btn--danger"
                type="button"
                onClick={() => void deletePool()}
                disabled={deletingPool}
              >
                {deletingPool ? "Deleting..." : "Delete Pool"}
              </button>
            </UiTooltip>
          ) : null}
        </div>
      </section>

      {loading ? (
        <UiLoadingState style={{ marginTop: 12 }}>
          <strong>Loading leaderboard...</strong>
        </UiLoadingState>
      ) : null}
      {msg ? (
        <UiStatus role="status" aria-live="polite" tone="error" style={{ marginTop: 12 }}>
          {msg}
        </UiStatus>
      ) : null}
      {!loading && forecastModeOn && forecastMsg ? (
        <UiStatus role="status" aria-live="polite" style={{ marginTop: 12 }}>
          {forecastMsg}
        </UiStatus>
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
                <div className="leaderboard-lock-notice">
                  Other brackets are hidden until draft lock
                  {lockTime ? ` (${formatDraftLockTimeET(lockTime)})` : ""}.
                </div>
              ) : null}

              <div className="leaderboard-view-toolbar">
                <div className="leaderboard-toolbar-copy">
                  <strong>leaderboard view</strong>
                  <p>
                    live shows current scoring; forecast estimates likely movement using expected outcomes.
                  </p>
                </div>
                <div
                  role="tablist"
                  aria-label="Leaderboard view mode"
                  className="leaderboard-segmented-control"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leaderboardMode === "live"}
                    onClick={() => setLeaderboardMode("live")}
                  >
                    Live
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={leaderboardMode === "forecast"}
                    onClick={() => setLeaderboardMode("forecast")}
                  >
                    Forecast
                  </button>
                </div>
                {forecastModeOn ? (
                  <div className="leaderboard-forecast-meta">
                    <span>
                      {forecastUpdatedAt
                        ? `Expected through ${forecastHorizonLabel} updated ${formatWhen(forecastUpdatedAt)}`
                        : "Expected outcomes are loading..."}
                    </span>
                    <UiButton
                      type="button"
                      onClick={() => setForecastInfoOpen(true)}
                      size="sm"
                    >
                      How forecast works
                    </UiButton>
                  </div>
                ) : null}
              </div>

              <div
                className="leaderboard-table-header"
                style={{
                  display: "grid",
                  gridTemplateColumns: leaderboardGridTemplate,
                  padding: isCompact ? "10px 10px" : "10px 12px",
                  fontWeight: 900,
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <div className="leaderboard-rank-cell" style={{ display: "inline-flex", alignItems: "center" }}>
                  <ExplainedValue
                    description={
                      forecastModeOn
                        ? "Expected rank is the entry's average finishing place across the forecast simulations. Lower is better, and decimals are normal because many simulated finishes are averaged together."
                        : "Rank is the current leaderboard position using the scores available right now. Tied entries share the same rank."
                    }
                  >
                    {forecastModeOn ? (isCompact ? "Exp" : "Exp Rank") : "Rank"}
                  </ExplainedValue>
                </div>
                <div className="leaderboard-player-cell" style={{ display: "inline-flex", alignItems: "center", minWidth: 0 }}>
                  <ExplainedValue description="The top line is the draft entry name. The smaller line is the player profile tied to that entry.">
                    Player
                  </ExplainedValue>
                </div>
                <div className="leaderboard-score-cell" style={{ display: "inline-flex", justifyContent: "flex-end", alignItems: "center", textAlign: "right" }}>
                  <ExplainedValue
                    side="left"
                    description={
                      forecastModeOn
                        ? "Expected is average projected points across the simulations. 1st is the share of simulations where this entry finishes tied for first."
                        : "Score is the current pool score from completed games and any live results already reflected in the leaderboard."
                    }
                  >
                    {forecastModeOn ? (isCompact ? "Exp/1st" : "Expected / 1st") : "Score"}
                  </ExplainedValue>
                </div>
              </div>

              {displayRows.map(({ row: r, forecast, displayRank, displayScore }) => {
                const canOpenBracket = draftLocked || r.user_id === myUserId;
                const canViewTeams = draftLocked || r.user_id === myUserId;
                const draftLabel = r.entry_name?.trim() || "Unnamed draft";
                const profileLabel =
                  r.full_name?.trim() || r.display_name?.trim() || "Unnamed player";

                return (
                  <div
                    key={r.entry_id}
                    className="leaderboard-entry-row"
                    data-current-user={r.user_id === myUserId ? "true" : "false"}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      background:
                        r.user_id === myUserId
                          ? "var(--surface-elevated)"
                          : "transparent",
                    }}
                  >
                    <div
                      className="leaderboard-entry-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: leaderboardGridTemplate,
                        padding: isCompact ? "10px 10px" : "10px 12px",
                        alignItems: "center",
                      }}
                    >
                      <div className="leaderboard-rank-cell" style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
                        <ExplainedValue
                          description={
                            forecastModeOn
                              ? "This is the entry's average finishing rank across the forecast simulations. Lower is better; for example, 6.3 means the entry lands around sixth place on average."
                              : "This is the entry's current rank using the latest available scores. Tied entries share the same rank."
                          }
                        >
                          {forecastModeOn ? displayRank : r.rank}
                        </ExplainedValue>
                        {forecastModeOn ? (
                          <span
                            style={{
                              color: "var(--foreground)",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            <ExplainedValue description="Live rank is this entry's current leaderboard position before forecast simulations are applied.">
                              <span style={{ opacity: 0.7 }}>Live {r.rank}</span>
                            </ExplainedValue>
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
                      <div className="leaderboard-player-cell" style={{ fontWeight: 800, minWidth: 0 }}>
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
                                className="leaderboard-entry-link"
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
                        className="leaderboard-score-cell"
                        style={{
                          textAlign: "right",
                          display: "grid",
                          justifyItems: "end",
                          gap: 2,
                        }}
                      >
                        <div style={{ fontWeight: 900, fontSize: 18 }}>
                          {forecastModeOn && forecast ? (
                            <ExplainedValue
                              side="left"
                              description={`Average projected final score across the forecast simulations. Projected change from current score ${forecast.current_score}: ${forecast.expected_add >= 0 ? "+" : ""}${formatExpectedScore(forecast.expected_add)} points.`}
                            >
                              {formatExpectedScore(displayScore)}
                            </ExplainedValue>
                          ) : (
                            <ExplainedValue
                              side="left"
                              description="Current pool score from the games already scored in the leaderboard."
                            >
                              {r.total_score}
                            </ExplainedValue>
                          )}
                        </div>
                        {forecastModeOn && forecast ? (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 800,
                              opacity: 0.86,
                            }}
                          >
                            <ExplainedValue
                              side="left"
                              description="The percentage of forecast simulations where this entry finishes tied for first place."
                            >
                              1st: {forecast.first_place_probability.toFixed(1)}%
                            </ExplainedValue>
                          </div>
                        ) : null}
                        <UiTooltip
                          content={
                            canViewTeams
                              ? "alive teams can still score more points"
                              : "teams stay hidden until draft lock"
                          }
                          side="left"
                        >
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
                        </UiTooltip>
                        {canViewTeams ? (
                          <UiTooltip content="open pick breakdown" side="left">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenBreakdownEntryId(r.entry_id);
                              }}
                              className="leaderboard-details-link"
                            >
                              Details
                            </button>
                          </UiTooltip>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {displayRows.length === 0 ? (
                <UiEmptyState as="div" className="leaderboard-empty-entry">
                  <strong>No entries yet.</strong>
                  <span>Enter one of your saved drafts to put it on this leaderboard.</span>
                  {!draftLocked ? (
                    <UiLinkButton
                      href={`/pool/${poolId}/draft`}
                      variant="primary"
                    >
                      Enter Drafts
                    </UiLinkButton>
                  ) : (
                    <span>Entries are locked for this pool.</span>
                  )}
                </UiEmptyState>
              ) : null}
            </div>

            <div className="leaderboard-archive-actions">
              <UiButton
                type="button"
                onClick={() => {
                  void openArchive();
                }}
              >
                Archive
              </UiButton>
            </div>
          </section>

          <aside style={{ display: "grid", gap: 12 }}>
            {showTeamInsights ? (
              <>
                <TeamValueTable
                  title="Best Value Teams"
                  rows={bestValueTeams}
                  totalRows={allValueTeams.length}
                  onViewAll={() => setTeamInsightsModal("value")}
                />
                <TeamPopularityTable
                  rows={popularTeams}
                  totalRows={allPopularTeams.length}
                  onViewAll={() => setTeamInsightsModal("popularity")}
                />
              </>
            ) : (
              <section className="leaderboard-insights-locked">
                <h2>Team Insights</h2>
                <UiEmptyState as="div">
                  {!draftLocked
                    ? "Team value and popularity tables unlock after draft lock."
                    : "Best value and most popular teams appear once tournament games start."}
                </UiEmptyState>
              </section>
            )}
          </aside>
        </div>
      ) : null}

      {teamInsightsModal ? (
        <div
          role="presentation"
          onClick={() => setTeamInsightsModal(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
            zIndex: 118,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              teamInsightsModal === "value" ? "All team value metrics" : "All team popularity metrics"
            }
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(820px, 100%)",
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
                  {teamInsightsModal === "value" ? "All Team Value" : "All Team Popularity"}
                </h2>
                <div style={{ marginTop: 4, opacity: 0.78, fontWeight: 700 }}>
                  {teamInsightsModal === "value"
                    ? `${allValueTeams.length} teams ranked by points per price`
                    : `${allPopularTeams.length} teams ranked by pool selections`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTeamInsightsModal(null)}
                style={{
                  padding: "8px 11px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface)",
                  color: "var(--foreground)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            {teamInsightsModal === "value" ? (
              <TeamValueTable title="Team Value Metrics" rows={allValueTeams} />
            ) : (
              <TeamPopularityTable rows={allPopularTeams} />
            )}
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
                of the tournament.
              </p>
              <p style={{ margin: 0 }}>
                It blends current pool scores with live game context and matchup strength signals,
                then updates as games progress.
              </p>
              <p style={{ margin: 0 }}>
                1st place % is the share of forecast simulations where that entry finishes in
                first place, including ties for first.
              </p>
              <p style={{ margin: 0 }}>
                Expected rank is the average finishing place across those simulations, so it can
                differ from expected points when an entry has upside but narrow paths to a top finish.
              </p>
              <p style={{ margin: 0, opacity: 0.82 }}>
                These numbers are not final standings and can move quickly with any upset.
              </p>
              {forecastBuild ? (
                <p style={{ margin: 0, opacity: 0.62, fontSize: 12 }}>
                  Forecast build: {forecastBuild}
                  {forecastWorldCupChampionshipRouting == null
                    ? ""
                    : ` · title routing ${forecastWorldCupChampionshipRouting ? "on" : "off"}`}
                </p>
              ) : null}
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

      {activeEntryRow && typeof document !== "undefined"
        ? createPortal(
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
                aria-label={`${activeEntryRow.entry_name ?? activeEntryRow.display_name ?? "Entry"} details`}
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
                  {activeBreakdown?.draft_label ?? activeEntryRow.entry_name ?? "Entry Details"}
                </h2>
                <div style={{ marginTop: 4, opacity: 0.8, fontWeight: 700 }}>
                  {activeBreakdown?.player_label ??
                    activeEntryRow.full_name?.trim() ??
                    activeEntryRow.display_name?.trim() ??
                    "Unnamed player"}
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
                Total: {activeBreakdown?.total_score ?? activeEntryRow.total_score}
              </div>
              {activeBreakdown && activeBreakdown.perfect_r64_bonus > 0 ? (
                <div
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 9999,
                    padding: "6px 10px",
                    fontWeight: 700,
                    opacity: 0.9,
                  }}
                >
                  Includes perfect R64 bonus: {activeBreakdown.perfect_r64_bonus}
                </div>
              ) : null}
              <div
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 9999,
                  padding: "6px 10px",
                  fontWeight: 700,
                  opacity: 0.9,
                }}
              >
                Alive: {activeEntryRow.active_team_count}
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
                Drafted Teams
              </div>
              {activeEntryRow.drafted_teams.length === 0 ? (
                <div style={{ padding: "12px", opacity: 0.8 }}>No drafted teams found.</div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 34px",
                      gap: 8,
                      padding: "9px 12px",
                      borderBottom: "1px solid var(--border-color)",
                      fontWeight: 800,
                    }}
                  >
                    <div>Team</div>
                    <div style={{ textAlign: "right" }}>Points</div>
                    <div aria-hidden="true" />
                  </div>
                  {activeEntryRow.drafted_teams.map((team) => {
                    const teamTotal = activeBreakdown?.team_totals.find((row) => row.team_id === team.team_id);
                    const teamEvents = activeEventsByTeamId.get(team.team_id) ?? [];
                    const isExpanded = expandedBreakdownTeamIds.has(team.team_id);
                    const canExpand = teamEvents.length > 0;
                    return (
                      <div key={team.team_id}>
                        <button
                          type="button"
                          disabled={!canExpand}
                          aria-expanded={canExpand ? isExpanded : undefined}
                          onClick={() => {
                            if (!canExpand) return;
                            setExpandedBreakdownTeamIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(team.team_id)) {
                                next.delete(team.team_id);
                              } else {
                                next.add(team.team_id);
                              }
                              return next;
                            });
                          }}
                          style={{
                            width: "100%",
                            display: "grid",
                            gridTemplateColumns: "1fr 100px 34px",
                            gap: 8,
                            padding: "10px 12px",
                            border: 0,
                            borderBottom: "1px solid var(--border-color)",
                            alignItems: "center",
                            background: "transparent",
                            color: "inherit",
                            cursor: canExpand ? "pointer" : "default",
                            opacity: team.is_active ? 1 : 0.48,
                            textAlign: "left",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <WorldCupLogoChip name={team.team_name} logoUrl={team.logo_url} />
                            <span
                              style={{
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {formatTeamLabel(team.team_name, team.seed, poolCompetitionSlug)}
                            </span>
                          </div>
                          <div style={{ textAlign: "right", fontWeight: 900 }}>
                            {teamTotal?.points ?? "-"}
                          </div>
                          <div
                            style={{
                              justifySelf: "end",
                              width: 24,
                              height: 24,
                              borderRadius: 999,
                              display: "inline-grid",
                              placeItems: "center",
                              color: canExpand ? "var(--foreground)" : "transparent",
                              opacity: canExpand ? 0.72 : 0,
                              transform: isExpanded ? "rotate(180deg)" : "none",
                              transition: "transform 160ms ease",
                            }}
                            aria-hidden="true"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" focusable="false">
                              <path d="M4 6L8 10L12 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        </button>
                        {isExpanded ? (
                          <div
                            style={{
                              display: "grid",
                              gap: 0,
                              padding: "0 12px 10px 52px",
                              borderBottom: "1px solid var(--border-color)",
                              background: "var(--surface-muted)",
                            }}
                          >
                            {teamEvents.map((event) => (
                              <div
                                key={event.id}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 84px",
                                  gap: 8,
                                  padding: "8px 0",
                                  borderTop: "1px solid var(--border-color)",
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                                    {formatRoundLabel(event.round)}
                                  </div>
                                  <div style={{ marginTop: 2, fontSize: 12, opacity: 0.74 }}>
                                    Base {event.scaled_base_points}
                                    {event.upset_bonus > 0 ? ` + upset ${event.upset_bonus}` : ""}
                                    {event.historic_bonus > 0 ? ` + historic ${event.historic_bonus}` : ""}
                                  </div>
                                </div>
                                <div style={{ textAlign: "right", fontWeight: 900 }}>
                                  {formatPointsDelta(event.points_awarded)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {activeBreakdown && activeBreakdown.perfect_r64_bonus > 0 ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 100px 34px",
                        gap: 8,
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--border-color)",
                        alignItems: "center",
                        background: "var(--surface-muted)",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>Perfect R64 Bonus</div>
                      <div style={{ textAlign: "right", fontWeight: 900 }}>
                        {formatPointsDelta(activeBreakdown.perfect_r64_bonus)}
                      </div>
                      <div aria-hidden="true" />
                    </div>
                  ) : null}
                </>
              )}
            </section>
              </div>
            </div>,
            document.body,
          )
        : null}

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

            {archiveLoading ? (
              <UiLoadingState
                title="loading archive years"
                description="checking saved leaderboard snapshots."
              />
            ) : null}
            {archiveMsg && archiveMsg.toLowerCase().includes("no archived") ? (
              <UiEmptyState
                as="div"
                title="no archive yet"
                description={archiveMsg}
              />
            ) : archiveMsg ? (
              <UiErrorState
                as="div"
                title="couldn't load archive"
                description={archiveMsg}
              />
            ) : null}

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

            {archiveDetailLoading ? (
              <UiLoadingState
                title="loading season results"
                description="building the archived standings view."
              />
            ) : null}

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
                    gridTemplateColumns:
                      poolCompetitionSlug === "world-cup"
                        ? "1fr 170px 120px"
                        : "80px 1fr 170px 120px",
                    padding: "9px 12px",
                    borderBottom: "1px solid var(--border-color)",
                    fontWeight: 900,
                  }}
                >
                  {poolCompetitionSlug === "world-cup" ? null : <div>Seed</div>}
                  <div>Team</div>
                  <div>Result</div>
                  <div style={{ textAlign: "right" }}>Points</div>
                </div>

                {archiveDetail.my_entry.drafted_teams.map((team) => {
                  const logoUrl =
                    poolCompetitionSlug === "world-cup"
                      ? worldCupLogoUrl(team.team_name, team.logo_url)
                      : team.logo_url;
                  return (
                    <div
                      key={team.team_id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          poolCompetitionSlug === "world-cup"
                            ? "1fr 170px 120px"
                            : "80px 1fr 170px 120px",
                        padding: "10px 12px",
                        borderBottom: "1px solid var(--border-color)",
                        alignItems: "center",
                      }}
                    >
                      {poolCompetitionSlug === "world-cup" ? null : (
                        <div style={{ fontWeight: 800 }}>{team.seed ?? "-"}</div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                        {poolCompetitionSlug === "world-cup" ? (
                          <WorldCupTeamLabel
                            name={team.team_name}
                            logoUrl={logoUrl}
                            nameStyle={{ fontWeight: 800 }}
                          />
                        ) : (
                          <div style={{ fontWeight: 800 }}>{toSchoolDisplayName(team.team_name)}</div>
                        )}
                      </div>
                      <div style={{ opacity: 0.85 }}>{formatArchiveRound(team.round_reached)}</div>
                      <div style={{ textAlign: "right", fontWeight: 900 }}>{team.total_team_score}</div>
                    </div>
                  );
                })}

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
