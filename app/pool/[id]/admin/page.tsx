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

type GameRow = {
  id: string;
  round: string;
  region: string | null;
  slot: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

const REGIONS = ["East", "West", "South", "Midwest"] as const;

export default function AdminPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [games, setGames] = useState<GameRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const teamById = useMemo(() => {
    const m = new Map<string, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const r64ByRegion = useMemo(() => {
    const out: Record<string, GameRow[]> = { East: [], West: [], South: [], Midwest: [] };
    for (const g of games) {
      if (g.round !== "R64" || !g.region) continue;
      if (out[g.region]) out[g.region].push(g);
    }
    for (const r of REGIONS) out[r].sort((a, b) => a.slot - b.slot);
    return out;
  }, [games]);

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

      // Creator check
      const { data: poolRow, error: poolErr } = await supabase
        .from("pools")
        .select("created_by")
        .eq("id", poolId)
        .single();

      if (poolErr) {
        setMsg(poolErr.message);
        setLoading(false);
        return;
      }

      if (poolRow.created_by !== user.id) {
        setMsg("Not authorized. Only the pool creator can access Admin.");
        setLoading(false);
        return;
      }

      // Load teams
      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,name,region,seed_in_region");

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }
      setTeams((teamRows ?? []) as Team[]);

      // Load games
      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("id,round,region,slot,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }
      setGames((gameRows ?? []) as GameRow[]);

      setLoading(false);
    };

    load();
  }, [poolId]);

  async function setWinner(gameId: string, winnerTeamId: string | null) {
    setMsg("");

    const { error } = await supabase.rpc("set_game_winner", {
      p_pool_id: poolId,
      p_game_id: gameId,
      p_winner_team_id: winnerTeamId,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    // Optimistically update local state (so page updates immediately)
    setGames((prev) =>
      prev.map((g) => (g.id === gameId ? { ...g, winner_team_id: winnerTeamId } : g))
    );

    setMsg("Winner updated.");
  }

  async function syncLogos() {
  setMsg("");

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    setMsg("Not logged in.");
    return;
  }

  const res = await fetch("/api/admin/sync-logos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poolId, userId }),
  });

  const json = await res.json();

  if (!res.ok) {
    setMsg(json.error ?? "Logo sync failed.");
    return;
  }

  setMsg(`Logos updated: ${json.updated}. Missing: ${json.missing?.length ?? 0}`);
}

  function teamLabel(teamId: string | null) {
    if (!teamId) return "TBD";
    const t = teamById.get(teamId);
    if (!t) return "Unknown";
    const seed = t.seed_in_region ?? "";
    const region = t.region ?? "";
    return `${t.name} ${seed ? `(Seed ${seed})` : ""}${region ? ` – ${region}` : ""}`;
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 1100, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Commissioner Admin</h1>
        <p style={{ marginTop: 12 }}>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: "48px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Commissioner Admin</h1>
        <div style={{ display: "flex", gap: 10 }}>
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

            <button
  onClick={syncLogos}
  style={{
    padding: "10px 12px",
    border: "1px solid #ccc",
    borderRadius: 10,
    fontWeight: 900,
    background: "white",
    cursor: "pointer",
  }}
>
  Sync Logos
</button>
            
            Back to Pool
          </a>
          <a
            href={`/pool/${poolId}/bracket`}
            style={{
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Bracket
          </a>
        </div>
      </div>

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      <p style={{ marginTop: 12, opacity: 0.8 }}>
        Set winners for Round of 64 games. Winners will auto-advance to the next round.
      </p>

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
              {(r64ByRegion[region] ?? []).map((g) => (
                <div
                  key={g.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
                    Game {g.slot}
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 800 }}>{teamLabel(g.team1_id)}</div>
                    <div style={{ fontWeight: 800 }}>{teamLabel(g.team2_id)}</div>
                  </div>

                  <select
                    value={g.winner_team_id ?? ""}
                    onChange={(e) => setWinner(g.id, e.target.value || null)}
                    style={{ marginTop: 10, padding: "6px 8px", borderRadius: 8, width: "100%" }}
                  >
                    <option value="">-- Select Winner --</option>
                    {g.team1_id ? <option value={g.team1_id}>{teamLabel(g.team1_id)}</option> : null}
                    {g.team2_id ? <option value={g.team2_id}>{teamLabel(g.team2_id)}</option> : null}
                  </select>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
