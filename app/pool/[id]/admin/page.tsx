"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

type PoolMemberWithPoolRow = PoolMemberRow & {
  pool_id: string;
};

type AdminPoolRow = {
  id: string;
  name: string;
  created_by: string;
};

const REGIONS = ["East", "West", "South", "Midwest"] as const;

export default function AdminPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [games, setGames] = useState<GameRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<PoolMemberRow[]>([]);
  const [adminPools, setAdminPools] = useState<AdminPoolRow[]>([]);
  const [membersByPool, setMembersByPool] = useState<Record<string, PoolMemberRow[]>>({});
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [removingMemberKey, setRemovingMemberKey] = useState<string | null>(null);
  const [deletingPoolId, setDeletingPoolId] = useState<string | null>(null);
  const [renamingPoolId, setRenamingPoolId] = useState<string | null>(null);
  const [rotatingPasswordPoolId, setRotatingPasswordPoolId] = useState<string | null>(null);
  const [poolNameDrafts, setPoolNameDrafts] = useState<Record<string, string>>({});
  const [poolPasswordDrafts, setPoolPasswordDrafts] = useState<Record<string, string>>({});
  const [syncSeason, setSyncSeason] = useState(String(new Date().getUTCFullYear()));
  const [sportsDataOnlyMode, setSportsDataOnlyMode] = useState(true);

  const memberKey = (targetPoolId: string, userId: string) => `${targetPoolId}:${userId}`;

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
      if (!poolId) {
        setMsg("Missing pool id.");
        setLoading(false);
        return;
      }

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

      const { data: allPoolRows, error: allPoolErr } = await supabase
        .from("pools")
        .select("id,name,created_by")
        .order("name", { ascending: true });

      if (allPoolErr) {
        setMsg(allPoolErr.message);
        setLoading(false);
        return;
      }

      const pools = (allPoolRows ?? []) as AdminPoolRow[];
      setAdminPools(pools);
      setPoolNameDrafts(Object.fromEntries(pools.map((pool) => [pool.id, pool.name])));
      setPoolPasswordDrafts(Object.fromEntries(pools.map((pool) => [pool.id, ""])));

      if (pools.length > 0) {
        const ids = pools.map((p) => p.id);
        const { data: allMembersRows, error: allMembersErr } = await supabase
          .from("pool_leaderboard")
          .select("pool_id,user_id,display_name")
          .in("pool_id", ids)
          .order("display_name", { ascending: true });

        if (allMembersErr) {
          setMsg(allMembersErr.message);
          setLoading(false);
          return;
        }

        const grouped: Record<string, PoolMemberRow[]> = {};
        for (const row of (allMembersRows ?? []) as PoolMemberWithPoolRow[]) {
          if (!grouped[row.pool_id]) grouped[row.pool_id] = [];
          grouped[row.pool_id].push({
            user_id: row.user_id,
            display_name: row.display_name,
          });
        }
        setMembersByPool(grouped);
      } else {
        setMembersByPool({});
      }

      setLoading(false);
    };

    load();
  }, [poolId]);

  async function removeUserFromPool(targetPoolId: string, targetUserId: string) {
    if (!targetPoolId || !targetUserId) return;

    const targetMemberKey = memberKey(targetPoolId, targetUserId);
    setRemovingMemberKey(targetMemberKey);
    setMsg("");

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const currentUser = authData?.user;

    if (authErr || !currentUser) {
      setMsg("Not logged in (could not read user).");
      setRemovingMemberKey(null);
      return;
    }

    try {
      const res = await fetch("/api/admin/remove-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolId: targetPoolId,
          userId: currentUser.id,
          targetUserId,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Remove failed: ${json.error ?? "Unknown error"}`);
        return;
      }

      if (targetPoolId === poolId) {
        setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
      }

      setMembersByPool((prev) => {
        const existing = prev[targetPoolId] ?? [];
        return {
          ...prev,
          [targetPoolId]: existing.filter((m) => m.user_id !== targetUserId),
        };
      });

      setMsg("User removed from this pool.");
    } catch (e: unknown) {
      setMsg(`Remove failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setRemovingMemberKey(null);
    }
  }

  async function deletePool(targetPoolId: string) {
    if (!targetPoolId) return;

    const confirmed = window.confirm(
      "Delete this pool permanently? This removes entries, picks, and member access."
    );
    if (!confirmed) return;

    setDeletingPoolId(targetPoolId);
    setMsg("");

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    const session = sessionData?.session;

    const { data: authData } = await supabase.auth.getUser();
    const fallbackUserId = authData?.user?.id ?? null;

    if (sessionErr && !fallbackUserId) {
      setMsg("Not logged in (could not read session).");
      setDeletingPoolId(null);
      return;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers.authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/admin/delete-pool", {
        method: "POST",
        headers,
        body: JSON.stringify({ poolId: targetPoolId, userId: fallbackUserId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Delete failed: ${json.error ?? "Unknown error"}`);
        return;
      }

      setAdminPools((prev) => prev.filter((p) => p.id !== targetPoolId));
      setPoolNameDrafts((prev) => {
        const next = { ...prev };
        delete next[targetPoolId];
        return next;
      });
      setPoolPasswordDrafts((prev) => {
        const next = { ...prev };
        delete next[targetPoolId];
        return next;
      });
      setMembersByPool((prev) => {
        const next = { ...prev };
        delete next[targetPoolId];
        return next;
      });

      if (targetPoolId === poolId) setMembers([]);

      setMsg("Pool deleted successfully. This pool and all associated data have been removed.");

      if (targetPoolId === poolId) {
        router.push("/pools");
      }
    } catch (e: unknown) {
      setMsg(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setDeletingPoolId(null);
    }
  }

  async function renamePool(targetPoolId: string) {
    const nextName = (poolNameDrafts[targetPoolId] ?? "").trim();
    if (!targetPoolId || !nextName) {
      setMsg("Enter a pool name before saving.");
      return;
    }

    setRenamingPoolId(targetPoolId);
    setMsg("");

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const currentUser = authData?.user;

    if (authErr || !currentUser) {
      setMsg("Not logged in (could not read user).");
      setRenamingPoolId(null);
      return;
    }

    try {
      const res = await fetch("/api/admin/rename-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolId: targetPoolId,
          userId: currentUser.id,
          name: nextName,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Rename failed: ${json.error ?? "Unknown error"}`);
        return;
      }

      const savedName = String(json.name ?? nextName);

      setAdminPools((prev) =>
        prev
          .map((pool) => (pool.id === targetPoolId ? { ...pool, name: savedName } : pool))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setPoolNameDrafts((prev) => ({ ...prev, [targetPoolId]: savedName }));
      setMsg("Pool name updated.");
    } catch (e: unknown) {
      setMsg(`Rename failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setRenamingPoolId(null);
    }
  }

  async function rotatePoolPassword(targetPoolId: string) {
    const nextPassword = (poolPasswordDrafts[targetPoolId] ?? "").trim();
    if (!targetPoolId || nextPassword.length < 4) {
      setMsg("Enter a password with at least 4 characters.");
      return;
    }

    setRotatingPasswordPoolId(targetPoolId);
    setMsg("");

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const currentUser = authData?.user;

    if (authErr || !currentUser) {
      setMsg("Not logged in (could not read user).");
      setRotatingPasswordPoolId(null);
      return;
    }

    try {
      const res = await fetch("/api/admin/rotate-pool-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolId: targetPoolId,
          userId: currentUser.id,
          password: nextPassword,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Password update failed: ${json.error ?? "Unknown error"}`);
        return;
      }

      setPoolPasswordDrafts((prev) => ({ ...prev, [targetPoolId]: "" }));
      setMsg("Pool password updated. This pool is now private.");
    } catch (e: unknown) {
      setMsg(`Password update failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setRotatingPasswordPoolId(null);
    }
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
      const season = Number(syncSeason);
      if (!Number.isFinite(season) || season < 2000 || season > 2100) {
        throw new Error("Enter a valid season year (e.g., 2025).");
      }

      const res = await fetch("/api/admin/full-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId, season, sportsDataOnly: sportsDataOnlyMode }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Full sync failed");
      }

      const passCount = Number(json?.passCount ?? 1);
      const linkedTotal = Number(json?.totals?.linked ?? json?.bracket?.linked ?? 0);
      const updatedTotal = Number(json?.totals?.updatedWinners ?? json?.scores?.updatedGames ?? 0);
      const finalsSeen = Number(json?.scores?.finalsSeen ?? 0);
      const skippedNoMap = Number(json?.bracket?.skippedNoMap ?? 0);
      const scheduleUpdated = Number(json?.bracket?.scheduleUpdated ?? 0);
      const skippedDuplicateSportsId = Number(json?.bracket?.skippedDuplicateSportsId ?? 0);
      const teamsCreated = Number(json?.bracket?.teamsCreated ?? 0);
      const teamsUpdated = Number(json?.bracket?.teamsUpdated ?? 0);
      const gameTeamsUpdated = Number(json?.bracket?.gameTeamsUpdated ?? 0);
      const clearedR64Teams = Number(json?.totals?.clearedR64Teams ?? json?.bracket?.clearedR64Teams ?? 0);

      setMsg(
        `Full Sync complete (season ${season}, passes ${passCount}, sportsdata-only: ${sportsDataOnlyMode ? "on" : "off"}) | linked: ${linkedTotal} ` +
          `(unmatched on last pass: ${skippedNoMap}, duplicate sports ids: ${skippedDuplicateSportsId}) | ` +
          `teams created/updated: ${teamsCreated}/${teamsUpdated}, game teams updated: ${gameTeamsUpdated}, r64 cleared: ${clearedR64Teams} | ` +
          `times/status updated: ${scheduleUpdated} | updated winners: ${updatedTotal} ` +
          `(finals seen on last pass: ${finalsSeen})`
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
    return `${t.name} ${seed ? `(Seed ${seed})` : ""}${region ? ` - ${region}` : ""}`;
  }

  if (loading) {
    return (
      <main style={{ maxWidth: 1100, margin: "48px auto", padding: 16 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Commissioner Admin</h1>
        <p style={{ marginTop: 12 }}>Loading...</p>
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
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <label htmlFor="sync-season" style={{ fontWeight: 800, fontSize: 13 }}>
              Season
            </label>
            <input
              id="sync-season"
              type="number"
              min={2000}
              max={2100}
              step={1}
              value={syncSeason}
              onChange={(e) => setSyncSeason(e.target.value)}
              style={{
                width: 92,
                padding: "8px 9px",
                borderRadius: 8,
                border: "1px solid #ccc",
                fontWeight: 700,
              }}
            />
          </div>
          <label
            htmlFor="sportsdata-only-mode"
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              fontWeight: 800,
              fontSize: 13,
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: "7px 9px",
              background: "#fff",
              whiteSpace: "nowrap",
            }}
            title="When on, Round of 64 team slots are cleared before applying SportsData teams."
          >
            <input
              id="sportsdata-only-mode"
              type="checkbox"
              checked={sportsDataOnlyMode}
              onChange={(e) => setSportsDataOnlyMode(e.target.checked)}
            />
            SportsData-only mode
          </label>

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
            onClick={fullSync}
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
                  disabled={isCreator || removingMemberKey === memberKey(poolId, m.user_id)}
                  onClick={() => removeUserFromPool(poolId, m.user_id)}
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
                  {removingMemberKey === memberKey(poolId, m.user_id) ? "Removing..." : "Remove from pool"}
                </button>
              </div>
            );
          })}

          {members.length === 0 ? <p style={{ margin: 0 }}>No members found.</p> : null}
        </div>
      </section>

      <section
        style={{
          marginTop: 16,
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>All active pools on the site</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          See every active pool across all players. Deleting a pool removes members, entries, picks, and the pool
          record so it no longer appears for players.
        </p>

        {adminPools.length === 0 ? <p style={{ margin: 0 }}>No active pools found.</p> : null}

        <div style={{ display: "grid", gap: 12 }}>
          {adminPools.map((pool) => {
            const poolMembers = membersByPool[pool.id] ?? [];
            return (
              <div
                key={pool.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontWeight: 900 }}>{pool.name}</div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>Members: {poolMembers.length}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input
                        value={poolNameDrafts[pool.id] ?? ""}
                        onChange={(e) =>
                          setPoolNameDrafts((prev) => ({
                            ...prev,
                            [pool.id]: e.target.value,
                          }))
                        }
                        placeholder="Pool name"
                        style={{
                          padding: "7px 9px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          minWidth: 230,
                        }}
                      />
                      <button
                        disabled={renamingPoolId === pool.id}
                        onClick={() => renamePool(pool.id)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #999",
                          background: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {renamingPoolId === pool.id ? "Saving..." : "Save name"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <input
                        type="password"
                        value={poolPasswordDrafts[pool.id] ?? ""}
                        onChange={(e) =>
                          setPoolPasswordDrafts((prev) => ({
                            ...prev,
                            [pool.id]: e.target.value,
                          }))
                        }
                        placeholder="New pool password"
                        minLength={4}
                        style={{
                          padding: "7px 9px",
                          borderRadius: 8,
                          border: "1px solid #ccc",
                          minWidth: 230,
                        }}
                      />
                      <button
                        disabled={rotatingPasswordPoolId === pool.id}
                        onClick={() => rotatePoolPassword(pool.id)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #999",
                          background: "#fff",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {rotatingPasswordPoolId === pool.id ? "Updating..." : "Update password"}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a
                      href={`/pool/${pool.id}/admin`}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ccc",
                        textDecoration: "none",
                        fontWeight: 800,
                      }}
                    >
                      Open admin
                    </a>
                    <button
                      disabled={deletingPoolId === pool.id}
                      onClick={() => deletePool(pool.id)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #d33",
                        background: "#fff",
                        color: "#a00",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {deletingPoolId === pool.id ? "Deleting..." : "Delete pool"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {poolMembers.map((m) => {
                    const isCreator = m.user_id === pool.created_by;
                    const label = m.display_name ?? m.user_id.slice(0, 8);
                    return (
                      <div
                        key={`${pool.id}-${m.user_id}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          border: "1px solid #f0f0f0",
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {label}
                          {isCreator ? " (commissioner)" : ""}
                        </div>
                        <button
                          disabled={isCreator || removingMemberKey === memberKey(pool.id, m.user_id)}
                          onClick={() => removeUserFromPool(pool.id, m.user_id)}
                          style={{
                            padding: "6px 9px",
                            borderRadius: 8,
                            border: "1px solid #d33",
                            background: isCreator ? "#f5f5f5" : "#fff",
                            color: isCreator ? "#888" : "#a00",
                            fontWeight: 700,
                            cursor: isCreator ? "not-allowed" : "pointer",
                          }}
                        >
                          {removingMemberKey === memberKey(pool.id, m.user_id) ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    );
                  })}
                  {poolMembers.length === 0 ? <p style={{ margin: 0 }}>No members found in this pool.</p> : null}
                </div>
              </div>
            );
          })}
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
