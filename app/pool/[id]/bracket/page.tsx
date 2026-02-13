"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type Team = {
  id: string;
  name: string;
  seed_in_region: number | null;
  region: string | null;
};

type Game = {
  id: string;
  round: string;
  region: string | null;
  slot: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type PlayerOption = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
};

const REGIONS = ["East", "West", "South", "Midwest"] as const;

// Mapping for R64 slot -> seed pair (for label display only)
const SLOT_SEED_PAIR: Record<number, [number, number]> = {
  1: [1, 16],
  2: [8, 9],
  3: [5, 12],
  4: [4, 13],
  5: [6, 11],
  6: [3, 14],
  7: [7, 10],
  8: [2, 15],
};

export default function BracketPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string>("");

  const [highlightTeamIds, setHighlightTeamIds] = useState<Set<string>>(new Set());

  const teamById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const gamesByRegion = useMemo(() => {
    const out: Record<string, Game[]> = {};
    for (const r of REGIONS) out[r] = [];
    for (const g of games) {
      if (g.round !== "R64") continue;
      if (!g.region) continue;
      if (out[g.region]) out[g.region].push(g);
    }
    for (const r of REGIONS) {
      out[r].sort((a, b) => a.slot - b.slot);
    }
    return out;
  }, [games]);

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

      // Teams (need region + seed_in_region)
      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,name,region,seed_in_region");

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }
      setTeams((teamRows ?? []) as Team[]);

      // Games
      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("id,round,region,slot,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }
      setGames((gameRows ?? []) as Game[]);

      // Players in this pool (use pool_leaderboard to get entry_id + display name)
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

      const opts = (playerRows ?? []) as PlayerOption[];
      setPlayers(opts);

      // Default: select first player (or none)
      setSelectedEntryId(opts[0]?.entry_id ?? "");

      setLoading(false);
    };

    load();
  }, [poolId]);

  // Load highlighted teams whenever selectedEntryId changes
  useEffect(() => {
    const loadHighlights = async () => {
      setHighlightTeamIds(new Set());

      if (!selectedEntryId) return;

      const { data, error } = await supabase
        .from("entry_picks")
        .select("team_id")
        .eq("entry_id", selectedEntryId);

      if (error) {
        setMsg(error.message);
        return;
      }

      setHighlightTeamIds(new Set((data ?? []).map((r: any) => r.team_id)));
    };

    loadHighlights();
  }, [selectedEntryId]);

  function renderTeam(teamId: string | null, winnerId: string | null) {
    if (!teamId) return <span style={{ opacity: 0.6 }}>TBD</span>;

    const t = teamById.get(teamId);
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
          border: "1px solid #eee",
          background: isHighlighted ? "#fff6d6" : "transparent",
          fontWeight: isWinner ? 900 : 700,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t?.name ?? "Unknown"}
        </span>
        <span style={{ opacity: 0.75, flexShrink: 0 }}>
          {t?.seed_in_region ?? ""}
        </span>
      </span>
    );
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 1100, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bracket</h1>
        <p style={{ marginTop: 12 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: "48px auto", padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Bracket</h1>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a
            href={`/pool/${poolId}`}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Back to Pool
          </a>

          <a
            href={`/pool/${poolId}/leaderboard`}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Leaderboard
          </a>
        </div>
      </div>

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900 }}>Highlight picks for:</div>
        <select
          value={selectedEntryId}
          onChange={(e) => setSelectedEntryId(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 10 }}
        >
          {players.length === 0 ? <option value="">No players yet</option> : null}
          {players.map((p) => (
            <option key={p.entry_id} value={p.entry_id}>
              {p.display_name ?? p.user_id.slice(0, 8)}
            </option>
          ))}
        </select>

        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Highlighted teams show in <b>yellow</b>.
        </div>
      </div>

      {/* Regions */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 14,
        }}
      >
        {REGIONS.map((region) => (
          <section
            key={region}
            style={{
              border: "1px solid #ddd",
              borderRadius: 12,
              padding: 12,
              minWidth: 0,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{region}</div>

            <div style={{ display: "grid", gap: 10 }}>
              {(gamesByRegion[region] ?? []).map((g) => {
                const pair = SLOT_SEED_PAIR[g.slot];
                return (
                  <div
                    key={g.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                      Game {g.slot} • Seeds {pair?.[0]} vs {pair?.[1]}
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      {renderTeam(g.team1_id, g.winner_team_id)}
                      {renderTeam(g.team2_id, g.winner_team_id)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
