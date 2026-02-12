"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";

type TeamRow = {
  team_id: string;
  name: string;
  seed: number;
  round_reached: string;
};

const ROUNDS = ["R64", "R32", "S16", "E8", "F4", "CHIP", "WIN"];

export default function AdminPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");

      // Auth check
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

      // Load teams (from view)
      const { data, error } = await supabase
        .from("team_scores")
        .select("team_id,name,seed,round_reached")
        .order("seed", { ascending: true });

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as TeamRow[]);
      setLoading(false);
    };

    load();
  }, [poolId]);

  async function updateRound(teamId: string, round: string) {
    setMsg("");

    const { error } = await supabase.rpc("update_team_round", {
      p_pool_id: poolId,
      p_team_id: teamId,
      p_round_reached: round,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.team_id === teamId ? { ...r, round_reached: round } : r
      )
    );
  }

  return (
    <main style={{ maxWidth: 1000, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Commissioner Admin</h1>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
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
          View Leaderboard
        </a>
      </div>

      {loading ? <p style={{ marginTop: 16 }}>Loading…</p> : null}
      {msg ? <p style={{ marginTop: 16 }}>{msg}</p> : null}

      {!loading && !msg ? (
        <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <div
              key={r.team_id}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 180px",
                gap: 12,
                alignItems: "center",
                padding: "8px 10px",
                border: "1px solid #eee",
                borderRadius: 10,
              }}
            >
              <div style={{ fontWeight: 900 }}>{r.seed}</div>
              <div style={{ fontWeight: 800 }}>{r.name}</div>
              <select
                value={r.round_reached}
                onChange={(e) => updateRound(r.team_id, e.target.value)}
                style={{ padding: "6px 8px", borderRadius: 6 }}
              >
                {ROUNDS.map((round) => (
                  <option key={round} value={round}>
                    {round}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
