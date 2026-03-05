"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

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
  14: 144,
  15: 240,
  16: 336,
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
        : Math.max(0, 12 * (winnerSeed - opponentSeed));

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
  total_score: number;
  rank: number;
};

type TeamSeedRow = { id: string; seed_in_region: number | null };
type PickRow = { entry_id: string; team_id: string };

export default function LeaderboardPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);

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
      setMyUserId(authData.user.id);

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
        "total_score" | "rank" | "full_name" | "entry_name"
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
      let fullNameByUser = new Map<string, string | null>();
      if (userIds.length > 0) {
        const { data: profileRows, error: profilesErr } = await supabase
          .from("profiles")
          .select("user_id,display_name,full_name")
          .in("user_id", userIds);

        if (profilesErr) {
          setMsg(profilesErr.message);
          setLoading(false);
          return;
        }

        fullNameByUser = new Map(
          (
            (profileRows as
              | { user_id: string; display_name: string | null; full_name: string | null }[]
              | null) ?? []
          ).map((row) => [row.user_id, row.full_name ?? row.display_name]),
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

      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("round,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }

      const teamScores = scoreTeamWins(
        (gameRows ?? []) as ScoringGame[],
        teamSeedById,
      );

      let picksByEntry = new Map<string, string[]>();
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
            full_name: fullNameByUser.get(r.user_id) ?? null,
            total_score: totalScore,
          };
        })
        .sort(
          (a, b) =>
            b.total_score - a.total_score ||
            (a.entry_name ?? a.display_name ?? "").localeCompare(
              b.entry_name ?? b.display_name ?? "",
            ),
        );

      let prevScore: number | null = null;
      let prevRank = 0;
      const ranked: Row[] = computed.map((r, idx) => {
        const rank = prevScore === r.total_score ? prevRank : idx + 1;
        prevScore = r.total_score;
        prevRank = rank;
        return { ...r, rank };
      });

      setRows(ranked);
      setLoading(false);
    };

    load();
  }, [poolId]);

  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Leaderboard</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            href={`/pool/${poolId}`}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Back to Pool
          </a>
          <a
            href={`/pool/${poolId}/draft`}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Draft
          </a>
        </div>
      </div>

      {loading ? <p style={{ marginTop: 12 }}>Loading…</p> : null}
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

          {rows.map((r) => (
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
              <div style={{ fontWeight: 900 }}>{r.rank}</div>
              <div style={{ fontWeight: 800 }}>
                <div>
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
                      {r.rank === 1 ? "🏆 " : ""}
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
                </div>
              </div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>
                {r.total_score}
              </div>
            </div>
          ))}

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
