"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { withAvatarFallback } from "../../../../lib/avatar";
import { formatDraftLockTimeET, isDraftLocked, resolveDraftLockTime } from "../../../../lib/draftLock";
import { scoreEntries, type ScoringGame } from "../../../../lib/scoring";

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

function formatArchiveRound(round: string | null) {
  if (!round) return "Did not make tournament";
  if (round === "R64") return "Round of 64";
  if (round === "R32") return "Round of 32";
  if (round === "S16") return "Sweet 16";
  if (round === "E8") return "Elite 8";
  if (round === "F4") return "Final Four";
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
                {row.logo_url ? (
                  <img
                    src={row.logo_url}
                    alt=""
                    width={18}
                    height={18}
                    style={{ objectFit: "contain", flexShrink: 0 }}
                  />
                ) : null}
                <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.team_name}
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
                {row.logo_url ? (
                  <img
                    src={row.logo_url}
                    alt=""
                    width={18}
                    height={18}
                    style={{ objectFit: "contain", flexShrink: 0 }}
                  />
                ) : null}
                <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.team_name}
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
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [poolName, setPoolName] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draftLocked, setDraftLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);
  const [isPoolOwner, setIsPoolOwner] = useState(false);
  const [showTeamInsights, setShowTeamInsights] = useState(false);
  const [bestValueTeams, setBestValueTeams] = useState<TeamValueRow[]>([]);
  const [popularTeams, setPopularTeams] = useState<TeamPopularityRow[]>([]);
  const [expandedTeamsByEntry, setExpandedTeamsByEntry] = useState<Record<string, boolean>>({});

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
        setPoolName("");
        setShowTeamInsights(false);
        setBestValueTeams([]);
        setPopularTeams([]);
      }
      setMsg("");

      try {
        await fetch("/api/scores/live?lookbackDays=1&lookaheadDays=0", { cache: "no-store" });
      } catch {
        // Live scores may be temporarily unavailable; continue loading leaderboard data.
      }

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setMsg("Please log in first.");
        setLoading(false);
        return;
      }
      const user = authData.user;
      setMyUserId(user.id);

      const { data: memberRow, error: memberErr } = await supabase
        .from("pool_members")
        .select("pool_id")
        .eq("pool_id", poolId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberErr) {
        setMsg(memberErr.message);
        setLoading(false);
        return;
      }

      if (!memberRow) {
        setMsg("Join this pool to view the leaderboard.");
        setLoading(false);
        return;
      }

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
      setPoolName((poolRow?.name as string | undefined) ?? "");
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
      const currentRoundReachedByTeam = roundReachedOrderByTeam(gameRows);

      const gamesStarted = hasGamesStarted(gameRows);
      const shouldShowInsights = isLocked && gamesStarted;
      const teamMetaById = new Map(teamRowsList.map((row) => [row.id, row]));

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
          const teamName = teamMeta?.name?.trim() || "Unknown team";
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
          const teamName = teamMeta?.name?.trim() || "Unknown team";
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
              return {
                team_id: teamId,
                team_name: teamMeta?.name?.trim() || "Unknown team",
                seed: teamMeta?.seed_in_region ?? null,
                logo_url: teamMeta?.logo_url ?? null,
                // Treat teams missing from bracket game data as not alive.
                is_active: gameTeamIds.has(teamId) && !eliminatedTeamIds.has(teamId),
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
      const todayEt = etDayKey(new Date());

      let missingGameDays = false;
      const priorGames: ScoringGame[] = [];
      for (const game of gameRows) {
        if (!game.winner_team_id) continue;
        const day = gameDayKey(game);
        if (!day) {
          missingGameDays = true;
          break;
        }
        if (day < todayEt) {
          priorGames.push(game);
        }
      }

      const priorRankByEntry = new Map<string, number>();
      if (!missingGameDays) {
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

      setExpandedTeamsByEntry({});
      setRows(ranked);
      setLoading(false);
    };

    void load();
  }, [poolId, refreshTick]);

  return (
    <main style={{ maxWidth: 1240, margin: "48px auto", padding: 16 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>
          {poolName ? `Leaderboard - ${poolName}` : "Leaderboard"}
        </h1>
      </div>

      {loading ? <p style={{ marginTop: 12 }}>Loading...</p> : null}
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      {!loading && !msg ? (
        <div className="leaderboard-layout" style={{ marginTop: 16 }}>
          <section>
            <div
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
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 140px",
                  padding: "10px 12px",
                  fontWeight: 900,
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <div>Rank</div>
                <div>Player</div>
                <div style={{ textAlign: "right" }}>Score</div>
              </div>

              {rows.map((r) => {
                const canOpenBracket = draftLocked || r.user_id === myUserId;
                const canViewTeams = draftLocked || r.user_id === myUserId;
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
                        gridTemplateColumns: "80px 1fr 140px",
                        padding: "10px 12px",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{r.rank}</span>
                        {r.rank_delta != null ? (
                          r.rank_delta > 0 ? (
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
                          )
                        ) : null}
                      </div>
                      <div style={{ fontWeight: 800 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                          <div>
                            {canOpenBracket ? (
                              <a
                                href={`/pool/${poolId}/bracket?entry=${r.entry_id}`}
                                style={{ textDecoration: "none", display: "inline-block" }}
                              >
                                <div
                                  style={{
                                    fontWeight: 800,
                                    color: "var(--foreground)",
                                    fontSize: 17,
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
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{r.total_score}</div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            opacity: 0.78,
                          }}
                        >
                          {canViewTeams ? `${r.active_team_count} alive` : "Hidden"}
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
                                {team.logo_url ? (
                                  <img
                                    src={team.logo_url}
                                    alt=""
                                    width={18}
                                    height={18}
                                    style={{ objectFit: "contain", flexShrink: 0 }}
                                  />
                                ) : null}
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {team.team_name}
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

              {rows.length === 0 ? (
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
                    gridTemplateColumns: "80px 1fr 130px",
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
                      gridTemplateColumns: "80px 1fr 130px",
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
                    <div style={{ fontWeight: 800 }}>
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
                      {team.logo_url ? (
                        <img
                          src={team.logo_url}
                          alt=""
                          width={22}
                          height={22}
                          style={{ objectFit: "contain", flexShrink: 0 }}
                        />
                      ) : null}
                      <div style={{ fontWeight: 800 }}>{team.team_name}</div>
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
