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

type PoolMemberRow = {
  user_id: string;
  display_name: string | null;
};

type EntryRow = {
  id: string;
  user_id: string;
};

const REGIONS = ["East", "West", "South", "Midwest"] as const;

export default function AdminPage() {
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [games, setGames] = useState<GameRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<PoolMemberRow[]>([]);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

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

      setCreatorId(poolRow.created_by);

      const { data: teamRows, error: teamErr } = await supabase
        .from("teams")
        .select("id,name,region,seed_in_region");

      if (teamErr) {
        setMsg(teamErr.message);
        setLoading(false);
        return;
      }
      setTeams((teamRows ?? []) as Team[]);

      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("id,round,region,slot,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(gameErr.message);
        setLoading(false);
        return;
      }
      setGames((gameRows ?? []) as GameRow[]);

      const { data: memberRows, error: memberErr } = await supabase
        .from("pool_leaderboard")
        .select("user_id,display_name")
        .eq("pool_id", poolId)
        .order("display_name", { ascending: true });

      if (memberErr) {
        setMsg(memberErr.message);
        setLoading(false);
        return;
      }

      setMembers((memberRows ?? []) as PoolMemberRow[]);
      setLoading(false);
    };

    load();
  }, [poolId]);

  async function removeUserFromPool(userId: string) {
    if (!poolId || !userId) return;

    setRemovingUserId(userId);
    setMsg("");

    const { data: entries, error: entryLoadErr } = await supabase
      .from("entries")
      .select("id,user_id")
      .eq("pool_id", poolId)
      .eq("user_id", userId);

    if (entryLoadErr) {
      setMsg(entryLoadErr.message);
      setRemovingUserId(null);
      return;
    }

    const entryRows = (entries ?? []) as EntryRow[];
    const entryIds = entryRows.map((e) => e.id);

    if (entryIds.length > 0) {
      const { error: picksDeleteErr } = await supabase
        .from("entry_picks")
        .delete()
        .in("entry_id", entryIds);

      if (picksDeleteErr) {
        setMsg(picksDeleteErr.message);
        setRemovingUserId(null);
        return;
      }

      const { error: entriesDeleteErr } = await supabase
        .from("entries")
        .delete()
        .in("id", entryIds);

      if (entriesDeleteErr) {
        setMsg(entriesDeleteErr.message);
        setRemovingUserId(null);
        return;
      }
    }

    const { error: membershipDeleteErr } = await supabase
      .from("pool_members")
      .delete()
      .eq("pool_id", poolId)
      .eq("user_id", userId);

    if (membershipDeleteErr) {
      setMsg(membershipDeleteErr.message);
      setRemovingUserId(null);
      return;
    }

    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    setMsg("User removed from this pool.");
    setRemovingUserId(null);
  }

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

    setGames((prev) => prev.map((g) => (g.id === gameId ? { ...g, winner_team_id: winnerTeamId } : g)));
    setMsg("Winner updated.");
  }

  async function syncLogos() {
    setMsg("Syncing logos...");

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (authErr || !userId) {
      setMsg("Not logged in (could not read user).");
      return;
    }
    
    try {
      const res = await fetch("/api/admin/sync-logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId, userId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(`Sync failed: ${json.error ?? "Unknown error"}`);
        return;
      }

      const updated = json.updated ?? 0;
      const missing = Array.isArray(json.missing) ? json.missing : [];
      
      setMsg(
        `Logos updated: ${updated}. Missing: ${missing.length}` +
          (missing.length ? ` | Missing teams: ${missing.join(", ")}` : "")
      );
    } catch (e: unknown) {
      setMsg(`Sync failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }

    async function fullSync() {
    setMsg("");
    setLoading(true);

        try {
      const res = await fetch("/api/admin/full-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error ?? "Full sync failed");
      }
      
      setMsg(
        `✅ Full Sync complete | import: ${json?.import?.note ?? "ok"} | linked: ${
          json?.link?.linked ?? "n/a"
        } | updated winners: ${json?.scores?.updatedGames ?? "n/a"}`
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Commissioner Admin</h1>

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

          <button
            onClick={syncLogos}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Sync Logos
          </button>

          <button
            onClick={fullSync}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Full Sync
          </button>

          <button
            onClick={async () => {
              setMsg("");
              setLoading(true);
              try {
                const date = "2025-MAR-28";
                const r = await fetch("/api/admin/sync-games", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ date }),
                });
                const j = await r.json();
                if (!r.ok) throw new Error(j?.error ?? "Sync failed");
                setMsg(
                  `Synced games for ${date}. Linked: ${j.linked}, Winners set: ${j.winnersSet}, Skipped no match: ${j.skippedNoMatch}, Skipped tie/no score: ${j.skippedTieOrNoScore}`
                );
              } catch (e: unknown) {
                setMsg(e instanceof Error ? e.message : "Unknown error");
              } finally {
                setLoading(false);
              }
            }}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Sync Games (SportsDataIO)
          </button>

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

      <section
        style={{
          marginTop: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gap: 8,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Pool members</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Remove users from this pool if they have not paid. This removes their membership and picks.
        </p>

        <div style={{ display: "grid", gap: 8 }}>
          {members.map((m) => {
            const isCreator = m.user_id === creatorId;
            const label = m.display_name ?? m.user_id.slice(0, 8);
            return (
              <div
                key={m.user_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {label}
                  {isCreator ? " (commissioner)" : ""}
                </div>
                <button
                  disabled={isCreator || removingUserId === m.user_id}
                  onClick={() => removeUserFromPool(m.user_id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #d33",
                    background: isCreator ? "#f5f5f5" : "#fff",
                    color: isCreator ? "#888" : "#a00",
                    fontWeight: 800,
                    cursor: isCreator ? "not-allowed" : "pointer",
                  }}
                >
                  {removingUserId === m.user_id ? "Removing…" : "Remove from pool"}
                </button>
              </div>
            );
          })}

          {members.length === 0 ? <p style={{ margin: 0 }}>No members found.</p> : null}
        </div>
      </section>

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
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Game {g.slot}</div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 800 }}>{teamLabel(g.team1_id)}</div>
                    <div style={{ fontWeight: 800 }}>{teamLabel(g.team2_id)}</div>
                  </div>

                  <select
                    value={g.winner_team_id ?? ""}
                    onChange={(e) => setWinner(g.id, e.target.value || null)}
                    style={{
                      marginTop: 10,
                      padding: "6px 8px",
                      borderRadius: 8,
                      width: "100%",
                    }}
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