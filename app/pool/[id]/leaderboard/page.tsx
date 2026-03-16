"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { withAvatarFallback } from "../../../../lib/avatar";
import { isDraftLocked, resolveDraftLockTime } from "../../../../lib/draftLock";

type ScoringGame = {
  round: string;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

const BASE_POINTS_BY_ROUND: Record<string, number> = {
  R64: 12,
  R32: 36,
  S16: 84,
  E8: 180,
  F4: 300,
  CHIP: 360,
};

const HISTORIC_BONUS_BY_SEED: Record<number, number> = {
  14: 24,
  15: 40,
  16: 56,
};

function seedMultiplier(seed: number | null | undefined): number {
  if (!seed || seed < 1 || seed > 16) return 1;
  return 1 + (seed - 1) * 0.035;
}

function scoreTeamWins(
  games: ScoringGame[],
  teamSeedById: Map<string, number | null>,
): Map<string, number> {
  const totals = new Map<string, number>();
  const historicAwarded = new Set<string>();

  for (const g of games) {
    const winnerId = g.winner_team_id;
    if (!winnerId) continue;

    const base = BASE_POINTS_BY_ROUND[g.round] ?? 0;
    if (!base) continue;

    const winnerSeed = teamSeedById.get(winnerId) ?? null;
    const opponentId =
      g.team1_id === winnerId
        ? g.team2_id
        : g.team2_id === winnerId
          ? g.team1_id
          : null;
    const opponentSeed = opponentId
      ? (teamSeedById.get(opponentId) ?? null)
      : null;
    const upsetBonus =
      !winnerSeed || !opponentSeed
        ? 0
        : Math.max(0, 4 * (winnerSeed - opponentSeed));

    let historicBonus = 0;
    if (
      g.round === "R64" &&
      winnerSeed &&
      HISTORIC_BONUS_BY_SEED[winnerSeed] &&
      !historicAwarded.has(winnerId)
    ) {
      historicBonus = HISTORIC_BONUS_BY_SEED[winnerSeed];
      historicAwarded.add(winnerId);
    }

    const winScore = Math.round(
      base * seedMultiplier(winnerSeed) + upsetBonus + historicBonus,
    );
    totals.set(winnerId, (totals.get(winnerId) ?? 0) + winScore);
  }

  return totals;
}

type Row = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
  entry_name: string | null;
  full_name: string | null;
  avatar_url: string;
  total_score: number;
  rank: number;
  rank_delta: number | null;
};

type TeamSeedRow = { id: string; seed_in_region: number | null };
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

function rankRows<
  T extends {
    total_score: number;
    entry_name: string | null;
    display_name: string | null;
  },
>(rows: T[]) {
  const sorted = [...rows].sort(
    (a, b) =>
      b.total_score - a.total_score ||
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

export default function LeaderboardPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draftLocked, setDraftLocked] = useState(false);
  const [lockTime, setLockTime] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");

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
        .select("id,seed_in_region");

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }

      const teamSeedById = new Map(
        ((teamRows as TeamSeedRow[] | null) ?? []).map((t) => [
          t.id,
          t.seed_in_region,
        ]),
      );

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

      const teamScores = scoreTeamWins(gameRows, teamSeedById);

      let picksByEntry = new Map<string, string[]>();
      if (isLocked && entryIds.length > 0) {
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

      const computed = baseRows
        .map((r) => {
          const teamIds = picksByEntry.get(r.entry_id) ?? [];
          const totalScore = teamIds.reduce(
            (sum, teamId) => sum + (teamScores.get(teamId) ?? 0),
            0,
          );
          return {
            ...r,
            entry_name: entryNameById.get(r.entry_id) ?? null,
            full_name: profileByUser.get(r.user_id)?.full_name ?? null,
            avatar_url: withAvatarFallback(
              r.user_id,
              profileByUser.get(r.user_id)?.avatar_url ?? null,
            ),
            total_score: totalScore,
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
        const priorTeamScores = scoreTeamWins(priorGames, teamSeedById);
        const priorComputed = baseRows.map((r) => {
          const teamIds = picksByEntry.get(r.entry_id) ?? [];
          const totalScore = teamIds.reduce(
            (sum, teamId) => sum + (priorTeamScores.get(teamId) ?? 0),
            0,
          );
          return {
            entry_id: r.entry_id,
            display_name: r.display_name,
            entry_name: entryNameById.get(r.entry_id) ?? null,
            total_score: totalScore,
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

      setRows(ranked);
      setLoading(false);
    };

    void load();
  }, [poolId]);

  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Leaderboard</h1>
      </div>

      {loading ? <p style={{ marginTop: 12 }}>Loading...</p> : null}
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      {!loading && !msg ? (
        <div
          style={{
            marginTop: 16,
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
              {lockTime ? ` (${new Date(lockTime).toLocaleString()})` : ""}.
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

            return (
              <div
                key={r.entry_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "80px 1fr 140px",
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--border-color)",
                  alignItems: "center",
                  background:
                    r.user_id === myUserId
                      ? "var(--surface-elevated)"
                      : "transparent",
                }}
              >
                <div style={{ fontWeight: 900, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{r.rank}</span>
                  {r.rank_delta != null ? (
                    r.rank_delta > 0 ? (
                      <span style={{ color: "#15803d", fontSize: 13, fontWeight: 900 }}>
                        ↑ {r.rank_delta}
                      </span>
                    ) : r.rank_delta < 0 ? (
                      <span style={{ color: "#b91c1c", fontSize: 13, fontWeight: 900 }}>
                        ↓ {Math.abs(r.rank_delta)}
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
                      alt={r.full_name ?? r.display_name ?? "Player"}
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
                            {r.entry_name ?? r.display_name ?? r.user_id.slice(0, 8)}
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
                            {r.full_name ?? "Unnamed player"}
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
                            {r.entry_name ?? r.display_name ?? r.user_id.slice(0, 8)}
                          </div>
                          <div
                            style={{
                              color: "var(--foreground)",
                              opacity: 0.72,
                              fontSize: 13,
                              marginTop: 2,
                            }}
                          >
                            Hidden until lock
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontWeight: 900 }}>
                  {r.total_score}
                </div>
              </div>
            );
          })}

          {rows.length === 0 ? (
            <div style={{ padding: "12px 12px" }}>
              No entries yet. Have friends join and draft.
            </div>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
