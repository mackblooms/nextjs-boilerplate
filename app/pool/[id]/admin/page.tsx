"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  full_name: string | null;
};

type PoolMemberWithPoolRow = {
  pool_id: string;
  user_id: string;
  display_name: string | null;
};

type ProfileNameRow = {
  user_id: string;
  full_name: string | null;
};

function memberPrimaryLabel(member: PoolMemberRow) {
  const realName = member.full_name?.trim();
  if (realName) return realName;

  const nickname = member.display_name?.trim();
  if (nickname) return nickname;

  return member.user_id.slice(0, 8);
}

function memberSecondaryLabel(member: PoolMemberRow) {
  const realName = member.full_name?.trim();
  const nickname = member.display_name?.trim();
  if (!nickname || nickname === realName) return null;
  return `Nickname: ${nickname}`;
}

function sortMembersByLabel(a: PoolMemberRow, b: PoolMemberRow) {
  return memberPrimaryLabel(a).localeCompare(memberPrimaryLabel(b));
}

type AdminPoolRow = {
  id: string;
  name: string;
  created_by: string;
};

type PoolPasswordResponse = {
  passwords?: Record<string, string | null>;
  error?: string;
};

const REGIONS = ["East", "West", "South", "Midwest"] as const;

export default function AdminPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const poolId = params.id;

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [syncingLogos, setSyncingLogos] = useState(false);
  const [fullSyncing, setFullSyncing] = useState(false);
  const [syncingGames, setSyncingGames] = useState(false);

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
  const [poolPasswords, setPoolPasswords] = useState<Record<string, string | null>>({});
  const [showPoolPasswords, setShowPoolPasswords] = useState<Record<string, boolean>>({});
  const [syncSeason, setSyncSeason] = useState(String(new Date().getUTCFullYear()));
  const [syncDate, setSyncDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sportsDataOnlyMode, setSportsDataOnlyMode] = useState(false);
  const [poolSearch, setPoolSearch] = useState("");

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

  const filteredAdminPools = useMemo(() => {
    const needle = poolSearch.trim().toLowerCase();
    if (!needle) return adminPools;
    return adminPools.filter((pool) => pool.name.toLowerCase().includes(needle));
  }, [adminPools, poolSearch]);

  const msgTone = useMemo<"success" | "error" | "info">(() => {
    const lower = msg.toLowerCase();
    if (!lower) return "info";
    if (
      lower.includes("failed") ||
      lower.includes("error") ||
      lower.includes("not logged in") ||
      lower.includes("not authorized") ||
      lower.includes("could not") ||
      lower.includes("missing")
    ) {
      return "error";
    }

    if (
      lower.includes("updated") ||
      lower.includes("complete") ||
      lower.includes("removed") ||
      lower.includes("deleted") ||
      lower.includes("saved")
    ) {
      return "success";
    }

    return "info";
  }, [msg]);

  const loadPoolPasswords = useCallback(async (targetPoolIds: string[]) => {
    if (targetPoolIds.length === 0) {
      setPoolPasswords({});
      setShowPoolPasswords({});
      return;
    }

    setPoolPasswords(Object.fromEntries(targetPoolIds.map((id) => [id, null])));
    setShowPoolPasswords(Object.fromEntries(targetPoolIds.map((id) => [id, false])));

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    let accessToken = sessionData?.session?.access_token ?? null;

    if (!accessToken) {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        setMsg(`Could not load stored pool passwords: ${refreshErr.message}`);
        return;
      }
      accessToken = refreshData?.session?.access_token ?? null;
    }

    if (!accessToken) {
      setMsg(
        sessionErr
          ? `Could not load stored pool passwords: ${sessionErr.message}`
          : "Could not load stored pool passwords: missing auth token."
      );
      return;
    }

    try {
      const res = await fetch("/api/admin/pool-passwords", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ poolIds: targetPoolIds }),
      });

      const json = (await res.json().catch(() => ({}))) as PoolPasswordResponse;
      if (!res.ok) {
        setMsg(`Could not load stored pool passwords: ${json.error ?? "Unknown error"}`);
        return;
      }

      const passwords = json.passwords ?? {};
      setPoolPasswords((prev) => ({ ...prev, ...passwords }));
    } catch {
      // Keep page usable even if password loading fails.
    }
  }, []);

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
      const baseMembers = ((memberRows ?? []) as Omit<PoolMemberRow, "full_name">[]).map((row) => ({
        ...row,
        full_name: null,
      }));

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
      await loadPoolPasswords(pools.map((pool) => pool.id));

      let allMembersRows: PoolMemberWithPoolRow[] = [];
      if (pools.length > 0) {
        const ids = pools.map((p) => p.id);
        const { data, error: allMembersErr } = await supabase
          .from("pool_leaderboard")
          .select("pool_id,user_id,display_name")
          .in("pool_id", ids)
          .order("display_name", { ascending: true });

        if (allMembersErr) {
          setMsg(allMembersErr.message);
          setLoading(false);
          return;
        }

        allMembersRows = (data ?? []) as PoolMemberWithPoolRow[];
      }

      const allUserIds = Array.from(
        new Set([
          ...baseMembers.map((row) => row.user_id),
          ...allMembersRows.map((row) => row.user_id),
        ])
      );

      let fullNameByUser = new Map<string, string | null>();
      if (allUserIds.length > 0) {
        const { data: profileRows, error: profileErr } = await supabase
          .from("profiles")
          .select("user_id,full_name")
          .in("user_id", allUserIds);

        if (!profileErr) {
          fullNameByUser = new Map(
            ((profileRows ?? []) as ProfileNameRow[]).map((row) => [row.user_id, row.full_name ?? null])
          );
        }
      }

      const membersWithNames = baseMembers
        .map((row) => ({
          ...row,
          full_name: fullNameByUser.get(row.user_id) ?? null,
        }))
        .sort(sortMembersByLabel);
      setMembers(membersWithNames);

      if (pools.length > 0) {
        const grouped: Record<string, PoolMemberRow[]> = {};
        for (const row of allMembersRows) {
          if (!grouped[row.pool_id]) grouped[row.pool_id] = [];
          grouped[row.pool_id].push({
            user_id: row.user_id,
            display_name: row.display_name,
            full_name: fullNameByUser.get(row.user_id) ?? null,
          });
        }
        for (const id of Object.keys(grouped)) {
          grouped[id].sort(sortMembersByLabel);
        }
        setMembersByPool(grouped);
      } else {
        setMembersByPool({});
      }

      setLoading(false);
    };

    load();
  }, [loadPoolPasswords, poolId]);

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
      setPoolPasswords((prev) => {
        const next = { ...prev };
        delete next[targetPoolId];
        return next;
      });
      setShowPoolPasswords((prev) => {
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
      setPoolPasswords((prev) => ({ ...prev, [targetPoolId]: nextPassword }));
      setShowPoolPasswords((prev) => ({ ...prev, [targetPoolId]: false }));
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

  function toSportsDataDate(dateValue: string) {
    const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new Error("Enter a valid sync date.");
    }

    const [, year, month, day] = match;
    const monthIndex = Number(month) - 1;
    const monthCodes = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const monthCode = monthCodes[monthIndex];

    if (!monthCode) {
      throw new Error("Enter a valid sync date.");
    }

    return `${year}-${monthCode}-${day}`;
  }

  async function syncLogos() {
    setMsg("Syncing logos...");
    setSyncingLogos(true);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (authErr || !userId) {
      setMsg("Not logged in (could not read user).");
      setSyncingLogos(false);
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
    } finally {
      setSyncingLogos(false);
    }
  }

  async function syncGamesByDate() {
    setMsg("Syncing SportsDataIO game results...");
    setSyncingGames(true);

    try {
      const season = Number(syncSeason);
      if (!Number.isFinite(season) || season < 2000 || season > 2100) {
        throw new Error("Enter a valid season year (e.g., 2026).");
      }

      const res = await fetch("/api/admin/sync-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Sync games failed");
      }

      const finalsSeen = Number(json?.finalsSeen ?? 0);
      const updatedGames = Number(json?.updatedGames ?? 0);
      const alreadySet = Number(json?.alreadySet ?? 0);
      const skippedUnlinked = Number(json?.skippedUnlinked ?? 0);
      const skippedNoTeamMap = Number(json?.skippedNoTeamMap ?? 0);
      const skippedTie = Number(json?.skippedTie ?? 0);
      const mode = String(json?.mode ?? "tournament");

      setMsg(
        `Sync Games complete (${mode === "tournament" ? `season ${season}` : "daily"}) | finals seen: ${finalsSeen}, ` +
          `winners updated: ${updatedGames}, already set: ${alreadySet}, skipped (unlinked): ${skippedUnlinked}, ` +
          `skipped (no team map): ${skippedNoTeamMap}, skipped (tie): ${skippedTie}`
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSyncingGames(false);
    }
  }

  async function fullSync() {
    setMsg("");
    setFullSyncing(true);

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
      const reassignedDuplicateSportsId = Number(json?.bracket?.reassignedDuplicateSportsId ?? 0);
      const teamsCreated = Number(json?.bracket?.teamsCreated ?? 0);
      const teamsUpdated = Number(json?.bracket?.teamsUpdated ?? 0);
      const normalizedSeedTeams = Number(json?.bracket?.normalizedSeedTeams ?? 0);
      const gameTeamsUpdated = Number(json?.bracket?.gameTeamsUpdated ?? 0);
      const r64Backfilled = Number(json?.bracket?.r64Backfilled ?? 0);
      const teamsWithoutSeed = Number(json?.bracket?.teamsWithoutSeed ?? 0);
      const teamsWithoutLogo = Number(json?.bracket?.teamsWithoutLogo ?? 0);
      const clearedR64Teams = Number(json?.totals?.clearedR64Teams ?? json?.bracket?.clearedR64Teams ?? 0);

      setMsg(
        `Full Sync complete (season ${season}, passes ${passCount}, sportsdata-only: ${sportsDataOnlyMode ? "on" : "off"}) | linked: ${linkedTotal} ` +
          `(unmatched on last pass: ${skippedNoMap}, duplicate sports ids skipped/reassigned: ${skippedDuplicateSportsId}/${reassignedDuplicateSportsId}) | ` +
          `teams created/updated: ${teamsCreated}/${teamsUpdated}, seeds normalized: ${normalizedSeedTeams}, game teams updated: ${gameTeamsUpdated}, r64 backfilled: ${r64Backfilled}, r64 cleared: ${clearedR64Teams}, ` +
          `missing seeds/logos: ${teamsWithoutSeed}/${teamsWithoutLogo} | ` +
          `times/status updated: ${scheduleUpdated} | updated winners: ${updatedTotal} ` +
          `(finals seen on last pass: ${finalsSeen})`
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setFullSyncing(false);
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
      <main style={{ maxWidth: 1100, margin: "28px auto", padding: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Commissioner Admin</h1>
        <p style={{ marginTop: 12 }}>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: "28px auto", padding: 12 }}>
      <div
        style={{
          display: "grid",
          gap: 12,
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 12,
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Commissioner Admin</h1>
          <p style={{ margin: 0, opacity: 0.8 }}>
            Manage members, pool settings, and bracket sync operations from one place.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}>
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
                minHeight: 44,
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                fontWeight: 700,
                background: "var(--surface)",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <label htmlFor="sync-date" style={{ fontWeight: 800, fontSize: 13 }}>
              Sync date
            </label>
            <input
              id="sync-date"
              type="date"
              value={syncDate}
              onChange={(e) => setSyncDate(e.target.value)}
              style={{
                padding: "8px 9px",
                minHeight: 44,
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                fontWeight: 700,
                background: "var(--surface)",
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
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              padding: "7px 9px",
              minHeight: 44,
              background: "var(--surface-muted)",
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

          <button
            onClick={syncLogos}
            disabled={syncingLogos || fullSyncing || syncingGames}
            style={{
              padding: "10px 12px",
              minHeight: 44,
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              fontWeight: 900,
              cursor: syncingLogos ? "not-allowed" : "pointer",
              background: "var(--surface)",
              opacity: syncingLogos ? 0.75 : 1,
            }}
          >
            {syncingLogos ? "Syncing Logos..." : "Sync Logos"}
          </button>

          <button
            onClick={fullSync}
            disabled={fullSyncing || syncingLogos || syncingGames}
            style={{
              padding: "10px 12px",
              minHeight: 44,
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              fontWeight: 900,
              cursor: fullSyncing ? "not-allowed" : "pointer",
              background: "var(--surface)",
              opacity: fullSyncing ? 0.75 : 1,
            }}
          >
            {fullSyncing ? "Running Full Sync..." : "Full Sync"}
          </button>

          <button
            onClick={syncGamesByDate}
            disabled={syncingGames || fullSyncing || syncingLogos}
            style={{
              padding: "10px 12px",
              minHeight: 44,
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              fontWeight: 900,
              cursor: syncingGames ? "not-allowed" : "pointer",
              background: "var(--surface)",
              opacity: syncingGames ? 0.75 : 1,
            }}
          >
            {syncingGames ? "Syncing Games..." : "Sync Games (SportsDataIO)"}
          </button>

          <a
            href={`/pool/${poolId}/bracket`}
            style={{
              padding: "10px 12px",
              minHeight: 44,
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 900,
              background: "var(--surface)",
              display: "flex",
              alignItems: "center",
            }}
          >
            Bracket
          </a>
        </div>
      </div>

      {msg ? (
        <p
          role="status"
          aria-live="polite"
          style={{
            marginTop: 12,
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            padding: "10px 12px",
            background:
              msgTone === "success"
                ? "var(--success-bg)"
                : msgTone === "error"
                  ? "var(--danger-bg)"
                  : "var(--surface-muted)",
            fontWeight: 700,
          }}
        >
          {msg}
        </p>
      ) : null}

      <section
        style={{
          marginTop: 16,
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gap: 8,
          background: "var(--surface)",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Pool members</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Real names are shown first, with bracket nicknames below when available. Removing a user deletes their
          membership and picks.
        </p>

        <div style={{ display: "grid", gap: 8 }}>
          {members.map((m) => {
            const isCreator = m.user_id === creatorId;
            const primaryLabel = memberPrimaryLabel(m);
            const secondaryLabel = memberSecondaryLabel(m);
            return (
              <div
                key={m.user_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--surface-muted)",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 220px", display: "grid", gap: 2 }}>
                  <div style={{ fontWeight: 800 }}>
                    {primaryLabel}
                    {isCreator ? " (commissioner)" : ""}
                  </div>
                  {secondaryLabel ? <div style={{ fontSize: 12, opacity: 0.75 }}>{secondaryLabel}</div> : null}
                </div>
                <button
                  disabled={isCreator || removingMemberKey === memberKey(poolId, m.user_id)}
                  onClick={() => removeUserFromPool(poolId, m.user_id)}
                  style={{
                    padding: "8px 10px",
                    minHeight: 44,
                    borderRadius: 8,
                    border: "1px solid #d33",
                    background: isCreator ? "var(--surface-elevated)" : "var(--surface)",
                    color: isCreator ? "#888" : "#a00",
                    fontWeight: 800,
                    cursor: isCreator ? "not-allowed" : "pointer",
                    flex: "1 1 190px",
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
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gap: 10,
          background: "var(--surface)",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>All active pools on the site</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          See every active pool across all players. Deleting a pool removes members, entries, picks, and the pool
          record so it no longer appears for players.
        </p>

        {adminPools.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <label htmlFor="pool-search" style={{ fontSize: 13, fontWeight: 800 }}>
              Filter pools
            </label>
            <input
              id="pool-search"
              type="text"
              value={poolSearch}
              onChange={(e) => setPoolSearch(e.target.value)}
              placeholder="Search by pool name"
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "9px 10px",
                minHeight: 44,
                borderRadius: 8,
                border: "1px solid var(--border-color)",
                background: "var(--surface-muted)",
              }}
            />
            <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
              Showing {filteredAdminPools.length} of {adminPools.length} pools
            </p>
          </div>
        ) : null}

        {adminPools.length === 0 ? <p style={{ margin: 0 }}>No active pools found.</p> : null}
        {adminPools.length > 0 && filteredAdminPools.length === 0 ? (
          <p style={{ margin: 0 }}>No pools match your filter.</p>
        ) : null}

        <div style={{ display: "grid", gap: 12 }}>
          {filteredAdminPools.map((pool) => {
            const poolMembers = membersByPool[pool.id] ?? [];
            const storedPassword = poolPasswords[pool.id] ?? null;
            const isPasswordVisible = showPoolPasswords[pool.id] ?? false;
            const canTogglePassword = storedPassword !== null;
            const passwordPlaceholder =
              pool.created_by === creatorId
                ? "No stored password yet. Update password once to reveal it here."
                : "Only this pool's creator can view its password.";
            return (
              <div
                key={pool.id}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 12,
                  padding: 10,
                  display: "grid",
                  gap: 10,
                  background: "var(--surface-muted)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: 8, minWidth: 0, flex: "1 1 440px" }}>
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
                          minHeight: 44,
                          borderRadius: 8,
                          border: "1px solid var(--border-color)",
                          minWidth: 0,
                          flex: "1 1 260px",
                          background: "var(--surface)",
                        }}
                      />
                      <button
                        disabled={renamingPoolId === pool.id}
                        onClick={() => renamePool(pool.id)}
                        style={{
                          padding: "8px 10px",
                          minHeight: 44,
                          borderRadius: 8,
                          border: "1px solid var(--border-color)",
                          background: "var(--surface)",
                          fontWeight: 700,
                          cursor: "pointer",
                          flex: "1 1 150px",
                        }}
                      >
                        {renamingPoolId === pool.id ? "Saving..." : "Save name"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 12, opacity: 0.75, width: "100%" }}>Current pool password</div>
                      <input
                        type={isPasswordVisible ? "text" : "password"}
                        value={storedPassword ?? ""}
                        readOnly
                        placeholder={passwordPlaceholder}
                        style={{
                          padding: "7px 9px",
                          minHeight: 44,
                          borderRadius: 8,
                          border: "1px solid var(--border-color)",
                          minWidth: 0,
                          flex: "1 1 300px",
                          background: "var(--surface-elevated)",
                        }}
                      />
                      <button
                        disabled={!canTogglePassword}
                        onClick={() =>
                          setShowPoolPasswords((prev) => ({
                            ...prev,
                            [pool.id]: !isPasswordVisible,
                          }))
                        }
                        style={{
                          padding: "8px 10px",
                          minHeight: 44,
                          borderRadius: 8,
                          border: "1px solid var(--border-color)",
                          background: canTogglePassword ? "var(--surface)" : "var(--surface-elevated)",
                          color: canTogglePassword ? "#111" : "#888",
                          fontWeight: 700,
                          cursor: canTogglePassword ? "pointer" : "not-allowed",
                          flex: "1 1 170px",
                        }}
                      >
                        {isPasswordVisible ? "Hide password" : "Show password"}
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
                          minHeight: 44,
                          borderRadius: 8,
                          border: "1px solid var(--border-color)",
                          minWidth: 0,
                          flex: "1 1 260px",
                          background: "var(--surface)",
                        }}
                      />
                      <button
                        disabled={rotatingPasswordPoolId === pool.id}
                        onClick={() => rotatePoolPassword(pool.id)}
                        style={{
                          padding: "8px 10px",
                          minHeight: 44,
                          borderRadius: 8,
                          border: "1px solid var(--border-color)",
                          background: "var(--surface)",
                          fontWeight: 700,
                          cursor: "pointer",
                          flex: "1 1 170px",
                        }}
                      >
                        {rotatingPasswordPoolId === pool.id ? "Updating..." : "Update password"}
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: "1 1 240px" }}>
                    <a
                      href={`/pool/${pool.id}/admin`}
                      style={{
                        padding: "8px 10px",
                        minHeight: 44,
                        borderRadius: 8,
                        border: "1px solid var(--border-color)",
                        textDecoration: "none",
                        fontWeight: 800,
                        background: "var(--surface)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flex: "1 1 140px",
                      }}
                    >
                      Open admin
                    </a>
                    <button
                      disabled={deletingPoolId === pool.id}
                      onClick={() => deletePool(pool.id)}
                      style={{
                        padding: "8px 10px",
                        minHeight: 44,
                        borderRadius: 8,
                        border: "1px solid #d33",
                        background: "var(--surface)",
                        color: "#a00",
                        fontWeight: 800,
                        cursor: "pointer",
                        flex: "1 1 140px",
                      }}
                    >
                      {deletingPoolId === pool.id ? "Deleting..." : "Delete pool"}
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {poolMembers.map((m) => {
                    const isCreator = m.user_id === pool.created_by;
                    const primaryLabel = memberPrimaryLabel(m);
                    const secondaryLabel = memberSecondaryLabel(m);
                    return (
                      <div
                        key={`${pool.id}-${m.user_id}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 12,
                          border: "1px solid var(--border-color)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          background: "var(--surface)",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: "1 1 200px", display: "grid", gap: 2 }}>
                          <div style={{ fontWeight: 700 }}>
                            {primaryLabel}
                            {isCreator ? " (commissioner)" : ""}
                          </div>
                          {secondaryLabel ? <div style={{ fontSize: 12, opacity: 0.75 }}>{secondaryLabel}</div> : null}
                        </div>
                        <button
                          disabled={isCreator || removingMemberKey === memberKey(pool.id, m.user_id)}
                          onClick={() => removeUserFromPool(pool.id, m.user_id)}
                          style={{
                            padding: "6px 9px",
                            minHeight: 44,
                            borderRadius: 8,
                            border: "1px solid #d33",
                            background: isCreator ? "var(--surface-elevated)" : "var(--surface)",
                            color: isCreator ? "#888" : "#a00",
                            fontWeight: 700,
                            cursor: isCreator ? "not-allowed" : "pointer",
                            flex: "1 1 120px",
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
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {REGIONS.map((region) => (
          <section
            key={region}
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 12,
              minWidth: 0,
              background: "var(--surface)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>{region}</div>

            <div style={{ display: "grid", gap: 10 }}>
              {(r64ByRegion[region] ?? []).length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
                  No Round of 64 games loaded for this region yet.
                </p>
              ) : null}
              {(r64ByRegion[region] ?? []).map((g) => (
                <div
                  key={g.id}
                  style={{
                    border: "1px solid var(--border-color)",
                    borderRadius: 12,
                    padding: 10,
                    background: "var(--surface-muted)",
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
                      minHeight: 44,
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
