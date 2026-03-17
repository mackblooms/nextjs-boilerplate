"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { formatDraftLockTimeET, isDraftLocked, resolveDraftLockTime } from "../../../../lib/draftLock";
import { scoreEntries } from "../../../../lib/scoring";

type Team = {
  id: string;
  name: string;
  seed_in_region: number | null;
  region: string | null;
  logo_url?: string | null;
  espn_team_id?: string | number | null;
};

type Game = {
  id: string;
  round: string;
  region: string | null;
  slot: number;
  status: string | null;
  start_time: string | null;
  game_date: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type PlayerOption = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
  entry_name: string | null;
  total_score: number;
  full_name: string | null;
  favorite_team: string | null;
  avatar_url: string | null;
  bio: string | null;
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
  awayScore: number | null;
  homeScore: number | null;
};

type LiveScoresResponse = {
  ok: boolean;
  games?: LiveScoreGame[];
  error?: string;
};

type MatchedLiveGame = {
  detail: string;
  team1Score: number | null;
  team2Score: number | null;
};

type UpsetSnapshot = {
  underdogLead: number;
  detail: string;
};

type RoundKey = "R64" | "R32" | "S16" | "E8";

const REGIONS = ["East", "West", "South", "Midwest"] as const;
type Region = (typeof REGIONS)[number];

const isRegion = (value: string | null): value is Region =>
  value !== null && REGIONS.includes(value as Region);

function isMissingColumnError(message: string) {
  const msg = message.toLowerCase();
  return msg.includes("column") && msg.includes("does not exist");
}

function toLiveStateRank(state: LiveScoreState) {
  if (state === "LIVE") return 2;
  if (state === "UPCOMING") return 1;
  return 0;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function parseSecondHalfMinutesRemaining(detail: string | null | undefined): number | null {
  if (!detail) return null;
  const match = detail.match(/2nd(?:\s*half)?[^0-9]*(\d{1,2}):(\d{2})/i);
  if (!match) return null;

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (minutes < 0 || seconds < 0 || seconds >= 60) return null;

  return minutes + seconds / 60;
}

function getUpsetSnapshot(
  game: Game,
  live: MatchedLiveGame | undefined,
  teamById: Map<string, Team>,
): UpsetSnapshot | null {
  if (!live || !game.team1_id || !game.team2_id) return null;
  if (typeof live.team1Score !== "number" || typeof live.team2Score !== "number") {
    return null;
  }

  const team1Seed = teamById.get(game.team1_id)?.seed_in_region;
  const team2Seed = teamById.get(game.team2_id)?.seed_in_region;
  if (typeof team1Seed !== "number" || typeof team2Seed !== "number") return null;
  if (team1Seed === team2Seed) return null;

  const underdogLead =
    team1Seed > team2Seed
      ? live.team1Score - live.team2Score
      : live.team2Score - live.team1Score;

  return { underdogLead, detail: live.detail };
}

function matchLiveScoresToGames(
  games: Game[],
  liveScores: LiveScoreGame[],
  espnTeamIdByLocalId: Map<string, string>,
): Map<string, MatchedLiveGame> {
  const liveByTeamPair = new Map<string, LiveScoreGame>();
  for (const live of liveScores) {
    if (!live.awayTeamId || !live.homeTeamId) continue;
    const key = pairKey(live.awayTeamId, live.homeTeamId);
    const existing = liveByTeamPair.get(key);
    if (!existing || toLiveStateRank(live.state) > toLiveStateRank(existing.state)) {
      liveByTeamPair.set(key, live);
    }
  }

  const out = new Map<string, MatchedLiveGame>();
  for (const g of games) {
    if (!g.team1_id || !g.team2_id) continue;
    const team1EspnId = espnTeamIdByLocalId.get(g.team1_id);
    const team2EspnId = espnTeamIdByLocalId.get(g.team2_id);
    if (!team1EspnId || !team2EspnId) continue;

    const live = liveByTeamPair.get(pairKey(team1EspnId, team2EspnId));
    if (!live) continue;

    if (live.awayTeamId === team1EspnId) {
      out.set(g.id, {
        detail: live.detail,
        team1Score: live.awayScore,
        team2Score: live.homeScore,
      });
      continue;
    }

    if (live.homeTeamId === team1EspnId) {
      out.set(g.id, {
        detail: live.detail,
        team1Score: live.homeScore,
        team2Score: live.awayScore,
      });
    }
  }

  return out;
}

export default function BracketPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;
  const searchParams = useSearchParams();
  const entryId = searchParams.get("entry");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");
  const [highlightTeamIds, setHighlightTeamIds] = useState<Set<string>>(
    new Set(),
  );
  const [myEntryId, setMyEntryId] = useState<string | null>(null);
  const [draftLocked, setDraftLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);
  const [liveScores, setLiveScores] = useState<LiveScoreGame[]>([]);
  const [maxUpsetLeadByGameId, setMaxUpsetLeadByGameId] = useState<Record<string, number>>({});

  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState(true);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const applyFitScale = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const next = Math.min(1, viewport.clientWidth / content.scrollWidth);
    setScale(Math.max(0.35, next));
  }, []);

  const teamById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const byRoundByRegion = useMemo(() => {
    const out: Record<Region, Record<RoundKey, Game[]>> = {
      East: { R64: [], R32: [], S16: [], E8: [] },
      West: { R64: [], R32: [], S16: [], E8: [] },
      South: { R64: [], R32: [], S16: [], E8: [] },
      Midwest: { R64: [], R32: [], S16: [], E8: [] },
    };

    for (const g of games) {
      if (!isRegion(g.region)) continue;
      if (
        g.round === "R64" ||
        g.round === "R32" ||
        g.round === "S16" ||
        g.round === "E8"
      ) {
        out[g.region][g.round].push(g);
      }
    }

    for (const region of REGIONS) {
      for (const round of ["R64", "R32", "S16", "E8"] as const) {
        out[region][round].sort((a, b) => a.slot - b.slot);
      }
    }

    return out;
  }, [games]);

  const finalFour = useMemo(
    () => games.filter((g) => g.round === "F4").sort((a, b) => a.slot - b.slot),
    [games],
  );

  const championship = useMemo(
    () => games.find((g) => g.round === "CHIP"),
    [games],
  );

  const BRACKET_UNITS = 16;
  const UNIT_PX = 44;
  const GAME_SPAN = 2;

  const rowStartFor = (round: RoundKey, slot: number) => {
    if (round === "R64") return (slot - 1) * 2 + 1;
    if (round === "R32") return (slot - 1) * 4 + 2;
    if (round === "S16") return (slot - 1) * 8 + 4;
    return 8;
  };

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

      if (!mem) {
        setMsg("Join this pool to view brackets.");
        setLoading(false);
        return;
      }

      const { data: poolRow, error: poolErr } = await supabase
        .from("pools")
        .select("lock_time")
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

      const teamQuery = await supabase
        .from("teams")
        .select("id,name,region,seed_in_region,logo_url,espn_team_id");
      let teamRows = (teamQuery.data ?? []) as Team[];
      let teamErr = teamQuery.error;

      if (teamErr && isMissingColumnError(teamErr.message ?? "")) {
        const fallback = await supabase
          .from("teams")
          .select("id,name,region,seed_in_region,logo_url");
        teamRows = (fallback.data ?? []).map((row) => ({
          ...row,
          espn_team_id: null,
        })) as Team[];
        teamErr = fallback.error;
      }

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }
      setTeams((teamRows ?? []) as Team[]);

      let { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("id,round,region,slot,status,start_time,game_date,team1_id,team2_id,winner_team_id");

      if (gameErr && isMissingColumnError(gameErr.message ?? "")) {
        const fallback = await supabase
          .from("games")
          .select("id,round,region,slot,team1_id,team2_id,winner_team_id");
        gameRows = (fallback.data ?? []).map((row) => ({
          ...row,
          status: null,
          start_time: null,
          game_date: null,
        })) as Game[];
        gameErr = fallback.error;
      }

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }
      setGames((gameRows ?? []) as Game[]);

      const { data: playerRows, error: playerErr } = await supabase
        .from("pool_leaderboard")
        .select("entry_id,user_id,display_name")
        .eq("pool_id", poolId)
        .order("display_name", { ascending: true });

      if (playerErr) {
        setMsg(playerErr.message);
        setLoading(false);
        return;
      }

      const basePlayers = (playerRows ?? []) as {
        entry_id: string;
        user_id: string;
        display_name: string | null;
      }[];

      const myEntry = basePlayers.find((p) => p.user_id === user.id)?.entry_id ?? null;
      setMyEntryId(myEntry);

      const visiblePlayers = isLocked
        ? basePlayers
        : myEntry
          ? basePlayers.filter((p) => p.entry_id === myEntry)
          : [];

      const entryIds = visiblePlayers.map((p) => p.entry_id);
      const userIds = Array.from(new Set(visiblePlayers.map((p) => p.user_id)));
      const teamSeedById = new Map(
        (((teamRows as Team[] | null) ?? []) as Team[]).map((t) => [t.id, t.seed_in_region ?? null]),
      );
      const picksByEntry = new Map<string, string[]>();

      let entryNameById = new Map<string, string | null>();
      if (entryIds.length > 0) {
        const { data: entryRows } = await supabase
          .from("entries")
          .select("id,entry_name")
          .in("id", entryIds);

        entryNameById = new Map(
          (
            (entryRows as { id: string; entry_name: string | null }[] | null) ??
            []
          ).map((row) => [row.id, row.entry_name]),
        );
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

        for (const row of (pickRows ?? []) as { entry_id: string; team_id: string }[]) {
          const entryPickIds = picksByEntry.get(row.entry_id) ?? [];
          entryPickIds.push(row.team_id);
          picksByEntry.set(row.entry_id, entryPickIds);
        }
      }
      const scoredEntries = scoreEntries((gameRows as Game[] | null) ?? [], teamSeedById, picksByEntry);

      let profileByUser = new Map<
        string,
        {
          full_name: string | null;
          favorite_team: string | null;
          avatar_url: string | null;
          bio: string | null;
        }
      >();

      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("user_id,display_name,full_name,favorite_team,avatar_url,bio")
          .in("user_id", userIds);

        profileByUser = new Map(
          (
            (profileRows as
              | {
                  user_id: string;
                  display_name: string | null;
                  full_name: string | null;
                  favorite_team: string | null;
                  avatar_url: string | null;
                  bio: string | null;
                }[]
              | null) ?? []
          ).map((row) => [
            row.user_id,
            {
              full_name: row.full_name ?? row.display_name,
              favorite_team: row.favorite_team,
              avatar_url: row.avatar_url,
              bio: row.bio,
            },
          ]),
        );
      }

      const opts: PlayerOption[] = visiblePlayers.map((p) => {
        const profile = profileByUser.get(p.user_id);
        return {
          entry_id: p.entry_id,
          user_id: p.user_id,
          display_name: p.display_name,
          entry_name: entryNameById.get(p.entry_id) ?? null,
          total_score: scoredEntries.totalScoreByEntryId.get(p.entry_id) ?? 0,
          full_name: profile?.full_name ?? null,
          favorite_team: profile?.favorite_team ?? null,
          avatar_url: profile?.avatar_url ?? null,
          bio: profile?.bio ?? null,
        };
      });

      if (!isLocked && entryId && entryId !== myEntry) {
        setMsg("Drafts are private until lock. You can only view your bracket right now.");
      }

      setPlayers(opts);
      const requestedEntry = entryId && opts.some((p) => p.entry_id === entryId)
        ? entryId
        : null;
      setSelectedEntryId(requestedEntry ?? myEntry ?? opts[0]?.entry_id ?? "");
      setLoading(false);
    };

    void load();
  }, [entryId, poolId]);

  useEffect(() => {
    const loadHighlights = async () => {
      setHighlightTeamIds(new Set());
      if (!selectedEntryId) return;

      if (!draftLocked && myEntryId && selectedEntryId !== myEntryId) {
        setMsg("Drafts are private until lock. You can only view your bracket right now.");
        return;
      }

      const { data, error } = await supabase
        .from("entry_picks")
        .select("team_id")
        .eq("entry_id", selectedEntryId);

      if (error) {
        setMsg(error.message);
        return;
      }

      setHighlightTeamIds(
        new Set((data ?? []).map((r) => r.team_id as string)),
      );
    };

    void loadHighlights();
  }, [draftLocked, myEntryId, selectedEntryId]);

  const espnTeamIdByLocalId = useMemo(() => {
    const out = new Map<string, string>();
    for (const t of teams) {
      if (t.espn_team_id == null) continue;
      const value = String(t.espn_team_id).trim();
      if (!value) continue;
      out.set(t.id, value);
    }
    return out;
  }, [teams]);

  useEffect(() => {
    let canceled = false;

    const loadLiveScores = async () => {
      try {
        const lookbackDays = 2;
        const lookaheadDays = 2;
        const res = await fetch(
          `/api/scores/live?lookbackDays=${lookbackDays}&lookaheadDays=${lookaheadDays}`,
          { cache: "no-store" },
        );
        const payload = (await res.json()) as LiveScoresResponse;
        if (!res.ok || !payload.ok) return;

        if (!canceled) {
          const nextScores = payload.games ?? [];
          setLiveScores(nextScores);

          const nextLiveByGameId = matchLiveScoresToGames(
            games,
            nextScores,
            espnTeamIdByLocalId,
          );

          setMaxUpsetLeadByGameId((prev) => {
            const validGameIds = new Set(games.map((g) => g.id));
            const next: Record<string, number> = {};

            for (const [gameId, lead] of Object.entries(prev)) {
              if (validGameIds.has(gameId)) {
                next[gameId] = lead;
              }
            }

            for (const g of games) {
              const snapshot = getUpsetSnapshot(g, nextLiveByGameId.get(g.id), teamById);
              if (!snapshot || snapshot.underdogLead <= 0) continue;
              next[g.id] = Math.max(next[g.id] ?? 0, snapshot.underdogLead);
            }

            return next;
          });
        }
      } catch {
        if (!canceled) {
          setLiveScores([]);
        }
      }
    };

    void loadLiveScores();
    const interval = window.setInterval(loadLiveScores, 45_000);

    return () => {
      canceled = true;
      window.clearInterval(interval);
    };
  }, [espnTeamIdByLocalId, games, teamById]);

  useEffect(() => {
    if (!fitMode || loading) return;

    const runFit = () => {
      window.requestAnimationFrame(applyFitScale);
    };

    runFit();
    window.addEventListener("resize", runFit);
    return () => window.removeEventListener("resize", runFit);
  }, [applyFitScale, fitMode, loading]);

  const zoomIn = () => {
    setFitMode(false);
    setScale((s) => Math.min(1.25, +(s + 0.1).toFixed(2)));
  };

  const zoomOut = () => {
    setFitMode(false);
    setScale((s) => Math.max(0.35, +(s - 0.1).toFixed(2)));
  };

  const setFit = () => {
    setFitMode(true);
    window.requestAnimationFrame(applyFitScale);
  };
  const set100 = () => {
    setFitMode(false);
    setScale(1);
  };

  const liveByGameId = useMemo(() => {
    return matchLiveScoresToGames(games, liveScores, espnTeamIdByLocalId);
  }, [espnTeamIdByLocalId, games, liveScores]);

  const formatGameTimeEst = useCallback((g: Game | null | undefined): string | null => {
    if (!g) return null;

    if (g.start_time) {
      const d = new Date(g.start_time);
      if (!Number.isNaN(d.getTime())) {
        return (
          d.toLocaleString("en-US", {
            timeZone: "America/New_York",
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          }) + " ET"
        );
      }
    }

    if (g.game_date) {
      const d = new Date(`${g.game_date}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) {
        return (
          d.toLocaleDateString("en-US", {
            timeZone: "America/New_York",
            weekday: "short",
            month: "short",
            day: "numeric",
          }) + " ET"
        );
      }
    }

    return null;
  }, []);

  const formatGameMeta = useCallback((g: Game | null | undefined): string | null => {
    if (!g) return null;
    const live = liveByGameId.get(g.id);
    if (live?.detail) return live.detail;
    return formatGameTimeEst(g);
  }, [formatGameTimeEst, liveByGameId]);

  const upsetWatchGameIds = useMemo(() => {
    const out = new Set<string>();

    for (const g of games) {
      const snapshot = getUpsetSnapshot(g, liveByGameId.get(g.id), teamById);
      if (!snapshot) continue;

      const minutesRemaining = parseSecondHalfMinutesRemaining(snapshot.detail);
      const isLateSecondHalfLead =
        snapshot.underdogLead > 0 &&
        minutesRemaining !== null &&
        minutesRemaining < 10;
      const hasFifteenPointLead =
        Math.max(
          maxUpsetLeadByGameId[g.id] ?? 0,
          snapshot.underdogLead > 0 ? snapshot.underdogLead : 0,
        ) >= 15;

      if (isLateSecondHalfLead || hasFifteenPointLead) {
        out.add(g.id);
      }
    }

    return out;
  }, [games, liveByGameId, maxUpsetLeadByGameId, teamById]);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.entry_id === selectedEntryId) ?? null,
    [players, selectedEntryId],
  );
  const finalFourTopLive = finalFour[0] ? liveByGameId.get(finalFour[0].id) : undefined;
  const finalFourBottomLive = finalFour[1] ? liveByGameId.get(finalFour[1].id) : undefined;
  const championshipLive = championship ? liveByGameId.get(championship.id) : undefined;
  const finalFourTopUpset = finalFour[0] ? upsetWatchGameIds.has(finalFour[0].id) : false;
  const finalFourBottomUpset = finalFour[1] ? upsetWatchGameIds.has(finalFour[1].id) : false;
  const championshipUpset = championship ? upsetWatchGameIds.has(championship.id) : false;

  const renderTeam = (
    teamId: string | null,
    winnerId: string | null,
    score?: number | null,
  ) => {
    if (!teamId) {
      return (
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            opacity: 0.6,
            fontWeight: 700,
          }}
        >
          <span>TBD</span>
          <span>{score === undefined ? "" : (score ?? "-")}</span>
        </span>
      );
    }

    const t = teamById.get(teamId);
    const espnId = t?.espn_team_id ? String(t.espn_team_id).trim() : "";
    const logoSrc = t?.logo_url || (espnId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png` : null);
    const isHighlighted = highlightTeamIds.has(teamId);
    const isWinner = winnerId === teamId;

    return (
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: isHighlighted ? "var(--highlight)" : "transparent",
          fontWeight: isWinner ? 900 : 700,
          alignItems: "center",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {logoSrc ? (
            <Image
              src={logoSrc}
              alt={t?.name ?? "Team"}
              width={18}
              height={18}
              style={{ objectFit: "contain", flexShrink: 0 }}
              unoptimized
            />
          ) : (
            <span style={{ width: 18, height: 18, flexShrink: 0 }} />
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t?.name ?? "Unknown"}
          </span>
        </span>
        <span
          style={{
            opacity: 0.75,
            flexShrink: 0,
            width: 40,
            textAlign: "right",
            whiteSpace: "nowrap",
            lineHeight: "18px",
          }}
        >
          {score === undefined
            ? (t?.seed_in_region ?? "")
            : (score ?? "-")}
        </span>
      </span>
    );
  };

  const renderGameBox = (
    children: ReactNode,
    meta?: string | null,
    upsetWatch = false,
  ) => (
    <div
      style={{
        border: upsetWatch
          ? "2px solid #d97706"
          : "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 6,
        background: "var(--surface)",
        boxShadow: upsetWatch
          ? "0 0 0 2px rgba(217,119,6,0.16)"
          : "0 1px 0 rgba(0,0,0,0.03)",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
      {meta ? (
        <div
          style={{
            marginTop: 6,
            paddingTop: 5,
            borderTop: "1px solid var(--border-color)",
            fontSize: 10,
            fontWeight: 700,
            opacity: 0.72,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={meta}
        >
          {meta}
        </div>
      ) : null}
    </div>
  );

  const renderSingleTeamBox = (
    teamId: string | null,
    winnerId: string | null,
    score?: number | null,
    upsetWatch = false,
  ) => (
    <div
      style={{
        border: upsetWatch
          ? "2px solid #d97706"
          : "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 6,
        background: "var(--surface)",
        boxShadow: upsetWatch
          ? "0 0 0 2px rgba(217,119,6,0.16)"
          : "0 1px 0 rgba(0,0,0,0.03)",
      }}
    >
      {renderTeam(teamId, winnerId, score)}
    </div>
  );

  const renderRegionBracket = (region: Region, reverse = false) => {
    const rounds = byRoundByRegion[region];

    const renderRoundColumn = (title: string, roundKey: RoundKey) => {
      const gamesForRound = rounds[roundKey] ?? [];

      return (
        <div style={{ minWidth: 260 }}>
          <div style={{ fontWeight: 900, marginBottom: 10, opacity: 0.9 }}>
            {title}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateRows: `repeat(${BRACKET_UNITS}, ${UNIT_PX}px)`,
              gap: 0,
            }}
          >
            {gamesForRound.map((g) => {
              const start = rowStartFor(roundKey, g.slot);
              const live = liveByGameId.get(g.id);
              const meta = formatGameMeta(g);
              return (
                <div
                  key={g.id}
                  style={{ gridRow: `${start} / span ${GAME_SPAN}` }}
                >
                  {renderGameBox(
                    <>
                      {renderTeam(g.team1_id, g.winner_team_id, live?.team1Score)}
                      {renderTeam(g.team2_id, g.winner_team_id, live?.team2Score)}
                    </>,
                    meta,
                    upsetWatchGameIds.has(g.id),
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <section
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 16,
          padding: 14,
          background: "var(--surface-muted)",
          minWidth: 4 * 260 + 3 * 16 + 40,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            marginBottom: 12,
            textAlign: reverse ? "left" : "inherit",
          }}
        >
          {region}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(260px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {!reverse ? (
            <>
              {renderRoundColumn("Round of 64", "R64")}
              {renderRoundColumn("Round of 32", "R32")}
              {renderRoundColumn("Sweet 16", "S16")}
              {renderRoundColumn("Elite 8", "E8")}
            </>
          ) : (
            <>
              {renderRoundColumn("Elite 8", "E8")}
              {renderRoundColumn("Sweet 16", "S16")}
              {renderRoundColumn("Round of 32", "R32")}
              {renderRoundColumn("Round of 64", "R64")}
            </>
          )}
        </div>
      </section>
    );
  };

  if (loading) {
    return (
      <main style={{ maxWidth: 1200, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bracket</h1>
        {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
        <p style={{ marginTop: 12, opacity: 0.8 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "100%", margin: "48px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          maxWidth: 1800,
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bracket</h1>
      </div>

      {selectedEntryId ? (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 12,
            background: "var(--highlight)",
            border: "1px solid var(--highlight-border)",
            fontWeight: 900,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            maxWidth: 1800,
            marginInline: "auto",
          }}
        >
          <div>Viewing a player&apos;s bracket (highlighting their teams)</div>
          <Link
            href={`/pool/${poolId}/bracket`}
            style={{
              fontWeight: 900,
              textDecoration: "none",
              border: "1px solid var(--highlight-border)",
              padding: "8px 10px",
              borderRadius: 10,
              background: "var(--surface)",
            }}
          >
            Clear
          </Link>
        </div>
      ) : null}

      {msg ? (
        <p style={{ marginTop: 12, maxWidth: 1800, marginInline: "auto" }}>
          {msg}
        </p>
      ) : null}

      {!draftLocked ? (
        <p
          style={{
            marginTop: 12,
            maxWidth: 1800,
            marginInline: "auto",
            opacity: 0.8,
            fontWeight: 700,
          }}
        >
          Other members&apos; brackets stay hidden until draft lock
          {lockTime ? ` (${formatDraftLockTimeET(lockTime)})` : ""}.
        </p>
      ) : null}

      {selectedPlayer ? (
        <section
          style={{
            marginTop: 14,
            maxWidth: 1800,
            marginInline: "auto",
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "flex",
            gap: 14,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          {selectedPlayer.avatar_url ? (
            <Image
              src={selectedPlayer.avatar_url}
              alt={
                selectedPlayer.full_name ??
                selectedPlayer.display_name ??
                "Player"
              }
              width={72}
              height={72}
              unoptimized
              style={{
                borderRadius: 9999,
                objectFit: "cover",
                border: "1px solid var(--border-color)",
              }}
            />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 9999,
                border: "1px solid var(--border-color)",
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                fontSize: 22,
                background: "var(--surface-muted)",
              }}
            >
              {(selectedPlayer.full_name ?? selectedPlayer.display_name ?? "P")
                .slice(0, 1)
                .toUpperCase()}
            </div>
          )}

          <div style={{ minWidth: 240, flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 21, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              {selectedPlayer.entry_name ??
                selectedPlayer.display_name ??
                "Bracket"}
              <span style={{ fontSize: 14, fontWeight: 800, opacity: 0.8 }}>
                {selectedPlayer.total_score} pts
              </span>
            </div>
            <div style={{ marginTop: 2, opacity: 0.75, fontWeight: 700 }}>
              {selectedPlayer.full_name ??
                selectedPlayer.display_name ??
                "Player"}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {selectedPlayer.favorite_team ? (
                <span
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 800,
                    background: "var(--surface-muted)",
                  }}
                >
                  Favorite team: {selectedPlayer.favorite_team}
                </span>
              ) : null}
            </div>

            {selectedPlayer.bio ? (
              <p style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.45 }}>
                {selectedPlayer.bio}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          maxWidth: 1800,
          marginInline: "auto",
        }}
      >
        <div style={{ fontWeight: 900 }}>Highlight picks for:</div>
        <select
          value={selectedEntryId}
          onChange={(e) => setSelectedEntryId(e.target.value)}
          disabled={players.length <= 1}
          style={{ padding: "8px 10px", borderRadius: 10 }}
        >
          {players.length === 0 ? (
            <option value="">No players yet</option>
          ) : null}
          {players.map((p) => (
            <option key={p.entry_id} value={p.entry_id}>
              {(p.entry_name ?? p.display_name ?? p.user_id.slice(0, 8)) + ` (${p.total_score} pts)`}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Highlighted teams show in <b>yellow</b>.
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          maxWidth: 1800,
          marginInline: "auto",
        }}
      >
        <div style={{ fontWeight: 900 }}>View:</div>
        <button
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
        <button
          onClick={zoomOut}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid var(--border-color)",
            background: "var(--surface)",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          −
        </button>
        <button
          onClick={zoomIn}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid var(--border-color)",
            background: "var(--surface)",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          +
        </button>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Zoom: <b>{Math.round(scale * 100)}%</b>
        </div>
      </div>

      <div
        ref={viewportRef}
        style={{
          marginTop: 12,
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          background: "var(--surface)",
          padding: 12,
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: "max-content",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 18,
              alignItems: "center",
              minWidth: 3200,
            }}
          >
            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              {renderRegionBracket("East")}
              {renderRegionBracket("South")}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 860,
              }}
            >
              <section
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 16,
                  padding: 14,
                  background: "var(--surface)",
                  width: 860,
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    marginBottom: 12,
                    fontSize: 16,
                    textAlign: "center",
                  }}
                >
                  Final Four
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr minmax(280px, 320px) 1fr",
                    gridTemplateRows:
                      "minmax(56px, auto) minmax(96px, auto) minmax(56px, auto)",
                    columnGap: 18,
                    rowGap: 20,
                    alignItems: "center",
                  }}
                >
                  <div style={{ gridColumn: 1, gridRow: 1 }}>
                    {renderSingleTeamBox(
                      finalFour[0]?.team1_id ?? null,
                      finalFour[0]?.winner_team_id ?? null,
                      finalFourTopLive?.team1Score,
                      finalFourTopUpset,
                    )}
                  </div>
                  <div style={{ gridColumn: 3, gridRow: 1 }}>
                    {renderSingleTeamBox(
                      finalFour[0]?.team2_id ?? null,
                      finalFour[0]?.winner_team_id ?? null,
                      finalFourTopLive?.team2Score,
                      finalFourTopUpset,
                    )}
                  </div>
                  <div style={{ gridColumn: 1, gridRow: 3 }}>
                    {renderSingleTeamBox(
                      finalFour[1]?.team1_id ?? null,
                      finalFour[1]?.winner_team_id ?? null,
                      finalFourBottomLive?.team1Score,
                      finalFourBottomUpset,
                    )}
                  </div>
                  <div style={{ gridColumn: 3, gridRow: 3 }}>
                    {renderSingleTeamBox(
                      finalFour[1]?.team2_id ?? null,
                      finalFour[1]?.winner_team_id ?? null,
                      finalFourBottomLive?.team2Score,
                      finalFourBottomUpset,
                    )}
                  </div>

                  <div
                    style={{
                      gridColumn: 2,
                      gridRow: 2,
                      alignSelf: "center",
                      justifySelf: "center",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        marginBottom: 10,
                        opacity: 0.9,
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      Championship
                    </div>
                    {renderGameBox(
                      <>
                        {renderTeam(
                          championship?.team1_id ?? null,
                          championship?.winner_team_id ?? null,
                          championshipLive?.team1Score,
                        )}
                        {renderTeam(
                          championship?.team2_id ?? null,
                          championship?.winner_team_id ?? null,
                          championshipLive?.team2Score,
                        )}
                      </>,
                      formatGameMeta(championship),
                      championshipUpset,
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
              {renderRegionBracket("West", true)}
              {renderRegionBracket("Midwest", true)}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
