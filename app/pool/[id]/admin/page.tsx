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

type PoolLeaderboardEntryRow = {
  pool_id: string;
  entry_id: string;
  user_id: string;
  display_name: string | null;
};

type EntryNameRow = {
  id: string;
  entry_name: string | null;
};

type EntryIdOnlyRow = {
  id: string;
};

type EntryPickRow = {
  entry_id: string;
  team_id: string;
};

type AdminPoolEntryRow = {
  pool_id: string;
  entry_id: string;
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  entry_name: string | null;
  picks_count: number;
  pick_signature: string | null;
};

type AdminPoolEntryViewRow = AdminPoolEntryRow & {
  duplicate_group_size: number;
  duplicate_entry_ids: string[];
};

type AdminPoolEntrySummary = {
  rows: AdminPoolEntryViewRow[];
  total_entries: number;
  duplicate_group_count: number;
  duplicate_entry_count: number;
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

function isMissingEntryNameError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.entry_name does not exist") ||
    message.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
  );
}

function summarizePoolEntries(rows: AdminPoolEntryRow[]): AdminPoolEntrySummary {
  const duplicateIdsByUserSignature = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.pick_signature || row.picks_count === 0) continue;
    const key = `${row.user_id}::${row.pick_signature}`;
    const list = duplicateIdsByUserSignature.get(key) ?? [];
    list.push(row.entry_id);
    duplicateIdsByUserSignature.set(key, list);
  }

  let duplicateGroupCount = 0;
  let duplicateEntryCount = 0;
  for (const ids of duplicateIdsByUserSignature.values()) {
    if (ids.length > 1) {
      duplicateGroupCount++;
      duplicateEntryCount += ids.length;
    }
  }

  const viewRows: AdminPoolEntryViewRow[] = rows
    .map((row) => {
      const key = row.pick_signature ? `${row.user_id}::${row.pick_signature}` : "";
      const ids = key ? (duplicateIdsByUserSignature.get(key) ?? []) : [];
      const duplicateIds = ids.length > 1 ? ids.filter((id) => id !== row.entry_id) : [];
      return {
        ...row,
        duplicate_group_size: duplicateIds.length > 0 ? duplicateIds.length + 1 : 0,
        duplicate_entry_ids: duplicateIds,
      };
    })
    .sort((a, b) => {
      const duplicateDiff = b.duplicate_group_size - a.duplicate_group_size;
      if (duplicateDiff !== 0) return duplicateDiff;

      const nameA = a.entry_name?.trim() || "";
      const nameB = b.entry_name?.trim() || "";
      const nameDiff = nameA.localeCompare(nameB);
      if (nameDiff !== 0) return nameDiff;

      const ownerA = a.full_name?.trim() || a.display_name?.trim() || a.user_id;
      const ownerB = b.full_name?.trim() || b.display_name?.trim() || b.user_id;
      return ownerA.localeCompare(ownerB);
    });

  return {
    rows: viewRows,
    total_entries: rows.length,
    duplicate_group_count: duplicateGroupCount,
    duplicate_entry_count: duplicateEntryCount,
  };
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
  const [repairingSeeds, setRepairingSeeds] = useState(false);

  const [games, setGames] = useState<GameRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [adminPools, setAdminPools] = useState<AdminPoolRow[]>([]);
  const [membersByPool, setMembersByPool] = useState<Record<string, PoolMemberRow[]>>({});
  const [entriesByPool, setEntriesByPool] = useState<Record<string, AdminPoolEntryRow[]>>({});
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
  const [activePoolModalId, setActivePoolModalId] = useState<string | null>(null);
  const [winnersModalOpen, setWinnersModalOpen] = useState(false);

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

  const activePoolModal = useMemo(() => {
    if (!activePoolModalId) return null;
    return adminPools.find((pool) => pool.id === activePoolModalId) ?? null;
  }, [activePoolModalId, adminPools]);

  const activePoolModalMembers = useMemo(() => {
    if (!activePoolModal) return [];
    return membersByPool[activePoolModal.id] ?? [];
  }, [activePoolModal, membersByPool]);

  const entrySummaryByPool = useMemo(() => {
    const summary: Record<string, AdminPoolEntrySummary> = {};
    for (const [targetPoolId, rows] of Object.entries(entriesByPool)) {
      summary[targetPoolId] = summarizePoolEntries(rows);
    }
    return summary;
  }, [entriesByPool]);

  const activePoolModalEntrySummary = useMemo<AdminPoolEntrySummary>(() => {
    if (!activePoolModal) {
      return { rows: [], total_entries: 0, duplicate_group_count: 0, duplicate_entry_count: 0 };
    }
    return entrySummaryByPool[activePoolModal.id] ?? {
      rows: [],
      total_entries: 0,
      duplicate_group_count: 0,
      duplicate_entry_count: 0,
    };
  }, [activePoolModal, entrySummaryByPool]);

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

  useEffect(() => {
    if (!activePoolModalId) return;
    if (adminPools.some((pool) => pool.id === activePoolModalId)) return;
    setActivePoolModalId(null);
  }, [activePoolModalId, adminPools]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activePoolModalId) setActivePoolModalId(null);
      if (winnersModalOpen) setWinnersModalOpen(false);
    };

    if (!activePoolModalId && !winnersModalOpen) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePoolModalId, winnersModalOpen]);

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

      let allLeaderboardRows: PoolLeaderboardEntryRow[] = [];
      if (pools.length > 0) {
        const ids = pools.map((p) => p.id);
        const { data, error: allMembersErr } = await supabase
          .from("pool_leaderboard")
          .select("pool_id,entry_id,user_id,display_name")
          .in("pool_id", ids)
          .order("display_name", { ascending: true });

        if (allMembersErr) {
          setMsg(allMembersErr.message);
          setLoading(false);
          return;
        }

        allLeaderboardRows = (data ?? []) as PoolLeaderboardEntryRow[];
      }

      const allUserIds = Array.from(
        new Set(allLeaderboardRows.map((row) => row.user_id))
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

      if (pools.length > 0) {
        const groupedMembers: Record<string, PoolMemberRow[]> = {};
        const seenMembers = new Set<string>();
        for (const row of allLeaderboardRows) {
          const key = `${row.pool_id}:${row.user_id}`;
          if (seenMembers.has(key)) continue;
          seenMembers.add(key);

          if (!groupedMembers[row.pool_id]) groupedMembers[row.pool_id] = [];
          groupedMembers[row.pool_id].push({
            user_id: row.user_id,
            display_name: row.display_name,
            full_name: fullNameByUser.get(row.user_id) ?? null,
          });
        }
        for (const id of Object.keys(groupedMembers)) {
          groupedMembers[id].sort(sortMembersByLabel);
        }
        setMembersByPool(groupedMembers);
      } else {
        setMembersByPool({});
      }

      const allEntryIds = Array.from(new Set(allLeaderboardRows.map((row) => row.entry_id)));

      let entryNameById = new Map<string, string | null>();
      if (allEntryIds.length > 0) {
        const withName = await supabase
          .from("entries")
          .select("id,entry_name")
          .in("id", allEntryIds);

        if (!withName.error) {
          entryNameById = new Map(
            ((withName.data ?? []) as EntryNameRow[]).map((row) => [row.id, row.entry_name ?? null]),
          );
        } else if (isMissingEntryNameError(withName.error.message)) {
          const fallback = await supabase
            .from("entries")
            .select("id")
            .in("id", allEntryIds);

          if (!fallback.error) {
            entryNameById = new Map(
              ((fallback.data ?? []) as EntryIdOnlyRow[]).map((row) => [row.id, null]),
            );
          }
        }
      }

      const picksByEntry = new Map<string, Set<string>>();
      if (allEntryIds.length > 0) {
        const { data: pickRows, error: pickErr } = await supabase
          .from("entry_picks")
          .select("entry_id,team_id")
          .in("entry_id", allEntryIds);

        if (!pickErr) {
          for (const row of (pickRows ?? []) as EntryPickRow[]) {
            const picks = picksByEntry.get(row.entry_id) ?? new Set<string>();
            picks.add(row.team_id);
            picksByEntry.set(row.entry_id, picks);
          }
        }
      }

      const groupedEntries: Record<string, AdminPoolEntryRow[]> = {};
      for (const row of allLeaderboardRows) {
        const picks = picksByEntry.get(row.entry_id) ?? new Set<string>();
        const pickSignature = picks.size > 0 ? Array.from(picks).sort().join("|") : null;

        if (!groupedEntries[row.pool_id]) groupedEntries[row.pool_id] = [];
        groupedEntries[row.pool_id].push({
          pool_id: row.pool_id,
          entry_id: row.entry_id,
          user_id: row.user_id,
          display_name: row.display_name,
          full_name: fullNameByUser.get(row.user_id) ?? null,
          entry_name: entryNameById.get(row.entry_id) ?? null,
          picks_count: picks.size,
          pick_signature: pickSignature,
        });
      }

      setEntriesByPool(groupedEntries);

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

      setMembersByPool((prev) => {
        const existing = prev[targetPoolId] ?? [];
        return {
          ...prev,
          [targetPoolId]: existing.filter((m) => m.user_id !== targetUserId),
        };
      });
      setEntriesByPool((prev) => {
        const existing = prev[targetPoolId] ?? [];
        return {
          ...prev,
          [targetPoolId]: existing.filter((entry) => entry.user_id !== targetUserId),
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
      setEntriesByPool((prev) => {
        const next = { ...prev };
        delete next[targetPoolId];
        return next;
      });

      if (activePoolModalId === targetPoolId) setActivePoolModalId(null);

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

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const userId = authData?.user?.id;

    if (authErr || !userId) {
      setMsg("Not logged in (could not read user).");
      return;
    }

    try {
      const res = await fetch("/api/admin/set-game-winner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poolId,
          userId,
          gameId,
          winnerTeamId,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(json.error ?? "Failed to set winner.");
        return;
      }

      const { data: gameRows, error: gameErr } = await supabase
        .from("games")
        .select("id,round,region,slot,team1_id,team2_id,winner_team_id");

      if (gameErr) {
        setMsg(`Winner saved, but refresh failed: ${gameErr.message}`);
        return;
      }

      setGames((gameRows ?? []) as GameRow[]);
      const advancedSlots = Number(json.advancedSlotsUpdated ?? 0);
      const advancedGames = Number(json.advancedGamesTouched ?? 0);
      const cleared = Number(json.clearedInvalidWinners ?? 0);
      setMsg(
        `Winner updated. Advanced slots/games: ${advancedSlots}/${advancedGames}. Cleared invalid winners: ${cleared}.`,
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Failed to set winner.");
    }
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
      const advancedSlotsUpdated = Number(json?.advancedSlotsUpdated ?? 0);
      const advancedGamesTouched = Number(json?.advancedGamesTouched ?? 0);
      const mode = String(json?.mode ?? "tournament");

      setMsg(
        `Sync Games complete (${mode === "tournament" ? `season ${season}` : "daily"}) | finals seen: ${finalsSeen}, ` +
          `winners updated: ${updatedGames}, already set: ${alreadySet}, skipped (unlinked): ${skippedUnlinked}, ` +
          `skipped (no team map): ${skippedNoTeamMap}, skipped (tie): ${skippedTie}, ` +
          `advanced slots/games: ${advancedSlotsUpdated}/${advancedGamesTouched}`
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
      const advancedSlotsTotal = Number(
        json?.totals?.advancedSlotsUpdated ?? json?.scores?.advancedSlotsUpdated ?? 0
      );
      const advancedGamesTotal = Number(
        json?.totals?.advancedGamesTouched ?? json?.scores?.advancedGamesTouched ?? 0
      );
      const finalsSeen = Number(json?.scores?.finalsSeen ?? 0);
      const skippedNoMap = Number(json?.bracket?.skippedNoMap ?? 0);
      const scheduleUpdated = Number(json?.bracket?.scheduleUpdated ?? 0);
      const skippedDuplicateSportsId = Number(json?.bracket?.skippedDuplicateSportsId ?? 0);
      const reassignedDuplicateSportsId = Number(json?.bracket?.reassignedDuplicateSportsId ?? 0);
      const teamsCreated = Number(json?.bracket?.teamsCreated ?? 0);
      const teamsUpdated = Number(json?.bracket?.teamsUpdated ?? 0);
      const espnFallbackMatchups = Number(json?.bracket?.espnFallbackMatchups ?? 0);
      const espnFallbackTeamsCreated = Number(json?.bracket?.espnFallbackTeamsCreated ?? 0);
      const espnFallbackTeamsUpdated = Number(json?.bracket?.espnFallbackTeamsUpdated ?? 0);
      const espnFallbackGameTeamsUpdated = Number(json?.bracket?.espnFallbackGameTeamsUpdated ?? 0);
      const firstFourPlaceholdersCreated = Number(json?.bracket?.firstFourPlaceholdersCreated ?? 0);
      const firstFourSlotsFilled = Number(json?.bracket?.firstFourSlotsFilled ?? 0);
      const playInAnchorsApplied = Number(json?.bracket?.playInAnchorsApplied ?? 0);
      const canonicalR64SlotsApplied = Number(json?.bracket?.canonicalR64SlotsApplied ?? 0);
      const canonicalTeamsCreated = Number(json?.bracket?.canonicalTeamsCreated ?? 0);
      const canonicalTeamsUpdated = Number(json?.bracket?.canonicalTeamsUpdated ?? 0);
      const canonicalR64RowsCreated = Number(json?.bracket?.canonicalR64RowsCreated ?? 0);
      const canonicalR64RowsRelocated = Number(json?.bracket?.canonicalR64RowsRelocated ?? 0);
      const normalizedSeedTeams = Number(json?.bracket?.normalizedSeedTeams ?? 0);
      const r64SeedOrderFixed = Number(json?.bracket?.r64SeedOrderFixed ?? 0);
      const brandingOverridesApplied = Number(json?.bracket?.brandingOverridesApplied ?? 0);
      const gameTeamsUpdated = Number(json?.bracket?.gameTeamsUpdated ?? 0);
      const r64Backfilled = Number(json?.bracket?.r64Backfilled ?? 0);
      const teamsWithoutSeed = Number(json?.bracket?.teamsWithoutSeed ?? 0);
      const teamsWithoutLogo = Number(json?.bracket?.teamsWithoutLogo ?? 0);
      const clearedR64Teams = Number(json?.totals?.clearedR64Teams ?? json?.bracket?.clearedR64Teams ?? 0);

      setMsg(
        `Full Sync complete (season ${season}, passes ${passCount}, sportsdata-only: ${sportsDataOnlyMode ? "on" : "off"}) | linked: ${linkedTotal} ` +
          `(unmatched on last pass: ${skippedNoMap}, duplicate sports ids skipped/reassigned: ${skippedDuplicateSportsId}/${reassignedDuplicateSportsId}) | ` +
          `teams created/updated: ${teamsCreated}/${teamsUpdated}, espn fallback (matchups/teams/game updates): ${espnFallbackMatchups}/${espnFallbackTeamsCreated + espnFallbackTeamsUpdated}/${espnFallbackGameTeamsUpdated}, ` +
          `first four placeholders created/filled: ${firstFourPlaceholdersCreated}/${firstFourSlotsFilled}, play-in anchors applied: ${playInAnchorsApplied}, ` +
          `canonical 2026 slots/teams (applied/created/updated): ${canonicalR64SlotsApplied}/${canonicalTeamsCreated}/${canonicalTeamsUpdated}, rows repaired (created/relocated): ${canonicalR64RowsCreated}/${canonicalR64RowsRelocated}, ` +
          `seeds normalized: ${normalizedSeedTeams}, r64 seed-order fixed: ${r64SeedOrderFixed}, branding fixed: ${brandingOverridesApplied}, game teams updated: ${gameTeamsUpdated}, r64 backfilled: ${r64Backfilled}, r64 cleared: ${clearedR64Teams}, ` +
          `missing seeds/logos: ${teamsWithoutSeed}/${teamsWithoutLogo} | ` +
          `times/status updated: ${scheduleUpdated} | updated winners: ${updatedTotal}, advanced slots/games: ${advancedSlotsTotal}/${advancedGamesTotal} ` +
          `(finals seen on last pass: ${finalsSeen})`
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setFullSyncing(false);
    }
  }

  async function repairSeeds() {
    setMsg("Repairing bracket seeds...");
    setRepairingSeeds(true);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (authErr || !userId) {
      setMsg("Not logged in (could not read user).");
      setRepairingSeeds(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/repair-seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId, userId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Seed repair failed");
      }

      const [teamRes, gameRes] = await Promise.all([
        supabase
          .from("teams")
          .select("id,name,seed_in_region,region"),
        supabase
          .from("games")
          .select("id,round,region,slot,team1_id,team2_id,winner_team_id"),
      ]);

      if (teamRes.error) throw new Error(`Seed repair complete, but teams refresh failed: ${teamRes.error.message}`);
      if (gameRes.error) throw new Error(`Seed repair complete, but games refresh failed: ${gameRes.error.message}`);

      setTeams((teamRes.data ?? []) as Team[]);
      setGames((gameRes.data ?? []) as GameRow[]);

      const gamesEligible = Number(json?.gamesEligible ?? 0);
      const gamesOrderFixed = Number(json?.gamesOrderFixed ?? 0);
      const teamsUpdated = Number(json?.teamsUpdated ?? 0);
      const seedFields = Number(json?.teamSeedFieldsUpdated ?? 0);
      const regionFields = Number(json?.teamRegionUpdated ?? 0);
      const costFields = Number(json?.teamCostUpdated ?? 0);
      const conflictCount = Number(json?.teamsWithConflicts ?? 0);
      const conflictResolved = Number(json?.teamsConflictResolved ?? 0);
      const seedInRegionBackfilled = Number(json?.teamsSeedInRegionBackfilled ?? 0);

      setMsg(
        `Seed repair complete | eligible games: ${gamesEligible}, game order fixed: ${gamesOrderFixed}, ` +
        `teams updated: ${teamsUpdated}, seed fields: ${seedFields}, region fields: ${regionFields}, cost fields: ${costFields}, ` +
        `conflicts: ${conflictCount} (resolved: ${conflictResolved}), seed_in_region backfilled: ${seedInRegionBackfilled}`
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Seed repair failed.");
    } finally {
      setRepairingSeeds(false);
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

  const activePoolPassword = activePoolModal ? (poolPasswords[activePoolModal.id] ?? null) : null;
  const activePoolPasswordVisible = activePoolModal ? (showPoolPasswords[activePoolModal.id] ?? false) : false;
  const activePoolCanTogglePassword = activePoolPassword !== null;
  const activePoolPasswordPlaceholder =
    !activePoolModal
      ? ""
      : activePoolModal.created_by === creatorId
        ? "No stored password yet. Update password once to reveal it here."
        : "Only this pool's creator can view its password.";

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
            disabled={syncingLogos || fullSyncing || syncingGames || repairingSeeds}
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
            disabled={fullSyncing || syncingLogos || syncingGames || repairingSeeds}
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
            disabled={syncingGames || fullSyncing || syncingLogos || repairingSeeds}
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

          <button
            onClick={repairSeeds}
            disabled={repairingSeeds || syncingGames || fullSyncing || syncingLogos}
            style={{
              padding: "10px 12px",
              minHeight: 44,
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              fontWeight: 900,
              cursor: repairingSeeds ? "not-allowed" : "pointer",
              background: "var(--surface)",
              opacity: repairingSeeds ? 0.75 : 1,
            }}
          >
            {repairingSeeds ? "Repairing Seeds..." : "Repair Seeds"}
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
          gap: 10,
          background: "var(--surface)",
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>All active pools on the site</h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          See every active pool across all players. Open a pool for full controls, or delete from this list.
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
            const poolEntrySummary = entrySummaryByPool[pool.id] ?? {
              rows: [],
              total_entries: 0,
              duplicate_group_count: 0,
              duplicate_entry_count: 0,
            };
            return (
              <div
                key={pool.id}
                style={{
                  border: "1px solid var(--border-color)",
                  borderRadius: 12,
                  padding: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  background: "var(--surface-muted)",
                }}
              >
                <div style={{ display: "grid", gap: 4, minWidth: 0, flex: "1 1 320px" }}>
                  <div style={{ fontWeight: 900 }}>{pool.name}</div>
                  <div style={{ fontSize: 13, opacity: 0.72 }}>Members: {poolMembers.length}</div>
                  <div style={{ fontSize: 13, opacity: 0.72 }}>Draft entries: {poolEntrySummary.total_entries}</div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: poolEntrySummary.duplicate_entry_count > 0 ? "#b91c1c" : "#166534",
                    }}
                  >
                    {poolEntrySummary.duplicate_entry_count > 0
                      ? `Same-user duplicates flagged: ${poolEntrySummary.duplicate_group_count} group${poolEntrySummary.duplicate_group_count === 1 ? "" : "s"} (${poolEntrySummary.duplicate_entry_count} entries)`
                      : "No same-user duplicate drafts detected"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: "1 1 240px", justifyContent: "end" }}>
                  <button
                    onClick={() => setActivePoolModalId(pool.id)}
                    style={{
                      padding: "8px 10px",
                      minHeight: 44,
                      borderRadius: 8,
                      border: "1px solid var(--border-color)",
                      fontWeight: 800,
                      background: "var(--surface)",
                      cursor: "pointer",
                      flex: "1 1 140px",
                    }}
                  >
                    Open admin
                  </button>
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
            );
          })}
        </div>
      </section>

      <section
        style={{
          marginTop: 16,
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          padding: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "grid", gap: 4, minWidth: 0, flex: "1 1 360px" }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Set winners (manual override)</h2>
          <p style={{ margin: 0, opacity: 0.8 }}>
            Scores sync should auto-advance winners. Open this only if you need to correct matchups manually.
          </p>
        </div>
        <button
          onClick={() => setWinnersModalOpen(true)}
          style={{
            padding: "10px 12px",
            minHeight: 44,
            borderRadius: 10,
            border: "1px solid var(--border-color)",
            fontWeight: 800,
            background: "var(--surface)",
            cursor: "pointer",
            flex: "1 1 180px",
          }}
        >
          Set winners
        </button>
      </section>

      {activePoolModal ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActivePoolModalId(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 60,
            padding: 16,
            display: "grid",
            placeItems: "center",
          }}
        >
          <section
            style={{
              width: "min(980px, 100%)",
              maxHeight: "92vh",
              overflowY: "auto",
              border: "1px solid var(--border-color)",
              borderRadius: 14,
              padding: 14,
              background: "var(--surface)",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>{activePoolModal.name}</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.75 }}>Members: {activePoolModalMembers.length}</p>
                <p style={{ margin: "4px 0 0", opacity: 0.75 }}>Draft entries: {activePoolModalEntrySummary.total_entries}</p>
                <p
                  style={{
                    margin: "4px 0 0",
                    fontWeight: 800,
                    color: activePoolModalEntrySummary.duplicate_entry_count > 0 ? "#b91c1c" : "#166534",
                  }}
                >
                  {activePoolModalEntrySummary.duplicate_entry_count > 0
                    ? `Same-user duplicates flagged: ${activePoolModalEntrySummary.duplicate_group_count} group${activePoolModalEntrySummary.duplicate_group_count === 1 ? "" : "s"} (${activePoolModalEntrySummary.duplicate_entry_count} entries)`
                    : "No same-user duplicate drafts detected"}
                </p>
              </div>
              <button
                onClick={() => setActivePoolModalId(null)}
                style={{
                  padding: "7px 10px",
                  minHeight: 44,
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface-muted)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={poolNameDrafts[activePoolModal.id] ?? ""}
                  onChange={(e) =>
                    setPoolNameDrafts((prev) => ({
                      ...prev,
                      [activePoolModal.id]: e.target.value,
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
                    background: "var(--surface-muted)",
                  }}
                />
                <button
                  disabled={renamingPoolId === activePoolModal.id}
                  onClick={() => renamePool(activePoolModal.id)}
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
                  {renamingPoolId === activePoolModal.id ? "Saving..." : "Save name"}
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type={activePoolPasswordVisible ? "text" : "password"}
                  value={activePoolPassword ?? ""}
                  readOnly
                  placeholder={activePoolPasswordPlaceholder}
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
                  disabled={!activePoolCanTogglePassword}
                  onClick={() =>
                    setShowPoolPasswords((prev) => ({
                      ...prev,
                      [activePoolModal.id]: !activePoolPasswordVisible,
                    }))
                  }
                  style={{
                    padding: "8px 10px",
                    minHeight: 44,
                    borderRadius: 8,
                    border: "1px solid var(--border-color)",
                    background: activePoolCanTogglePassword ? "var(--surface)" : "var(--surface-elevated)",
                    color: activePoolCanTogglePassword ? "#111" : "#888",
                    fontWeight: 700,
                    cursor: activePoolCanTogglePassword ? "pointer" : "not-allowed",
                    flex: "1 1 170px",
                  }}
                >
                  {activePoolPasswordVisible ? "Hide password" : "Show password"}
                </button>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="password"
                  value={poolPasswordDrafts[activePoolModal.id] ?? ""}
                  onChange={(e) =>
                    setPoolPasswordDrafts((prev) => ({
                      ...prev,
                      [activePoolModal.id]: e.target.value,
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
                    background: "var(--surface-muted)",
                  }}
                />
                <button
                  disabled={rotatingPasswordPoolId === activePoolModal.id}
                  onClick={() => rotatePoolPassword(activePoolModal.id)}
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
                  {rotatingPasswordPoolId === activePoolModal.id ? "Updating..." : "Update password"}
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Pool drafts</h3>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
                Each row shows draft name, entry ID, and duplicate status based on identical pick sets within the same user&apos;s entries.
              </p>

              {activePoolModalEntrySummary.rows.map((entry) => {
                const draftLabel = entry.entry_name?.trim() || "Unnamed draft";
                const ownerLabel =
                  entry.full_name?.trim() ||
                  entry.display_name?.trim() ||
                  entry.user_id.slice(0, 8);
                const duplicateFlag = entry.duplicate_group_size > 1;
                return (
                  <div
                    key={`${entry.pool_id}:${entry.entry_id}`}
                    style={{
                      display: "grid",
                      gap: 6,
                      border: `1px solid ${duplicateFlag ? "#ef4444" : "var(--border-color)"}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      background: duplicateFlag ? "#fef2f2" : "var(--surface-muted)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "start",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontWeight: 800, minWidth: 0 }}>
                        <span>{draftLabel}</span>
                        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, opacity: 0.75 }}>
                          ({ownerLabel})
                        </span>
                      </div>
                      {duplicateFlag ? (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            color: "#991b1b",
                            border: "1px solid #fca5a5",
                            borderRadius: 999,
                            padding: "2px 8px",
                            background: "#fee2e2",
                          }}
                        >
                          Same-user duplicate x{entry.duplicate_group_size}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#166534" }}>
                          Unique picks for user
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.9 }}>
                      Entry ID:{" "}
                      <code style={{ fontSize: 11, wordBreak: "break-all" }}>{entry.entry_id}</code>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>Teams picked: {entry.picks_count}</div>

                    {duplicateFlag ? (
                      <div style={{ fontSize: 12, color: "#7f1d1d" }}>
                        Matches this user&apos;s entry IDs:{" "}
                        <code style={{ fontSize: 11, wordBreak: "break-all" }}>
                          {entry.duplicate_entry_ids.join(", ")}
                        </code>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {activePoolModalEntrySummary.rows.length === 0 ? (
                <p style={{ margin: 0 }}>No draft entries found in this pool.</p>
              ) : null}
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Pool members</h3>
              {activePoolModalMembers.map((m) => {
                const isCreator = m.user_id === activePoolModal.created_by;
                const primaryLabel = memberPrimaryLabel(m);
                const secondaryLabel = memberSecondaryLabel(m);
                return (
                  <div
                    key={`${activePoolModal.id}-${m.user_id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                      border: "1px solid var(--border-color)",
                      borderRadius: 8,
                      padding: "8px 10px",
                      background: "var(--surface-muted)",
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
                      disabled={isCreator || removingMemberKey === memberKey(activePoolModal.id, m.user_id)}
                      onClick={() => removeUserFromPool(activePoolModal.id, m.user_id)}
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
                      {removingMemberKey === memberKey(activePoolModal.id, m.user_id) ? "Removing..." : "Remove"}
                    </button>
                  </div>
                );
              })}
              {activePoolModalMembers.length === 0 ? <p style={{ margin: 0 }}>No members found in this pool.</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {winnersModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWinnersModalOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 60,
            padding: 16,
            display: "grid",
            placeItems: "center",
          }}
        >
          <section
            style={{
              width: "min(1120px, 100%)",
              maxHeight: "92vh",
              overflowY: "auto",
              border: "1px solid var(--border-color)",
              borderRadius: 14,
              padding: 14,
              background: "var(--surface)",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Set winners</h2>
                <p style={{ margin: "4px 0 0", opacity: 0.75 }}>
                  Manual override only. Each winner change saves immediately.
                </p>
              </div>
              <button
                onClick={() => setWinnersModalOpen(false)}
                style={{
                  padding: "7px 10px",
                  minHeight: 44,
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  background: "var(--surface-muted)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
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
                    background: "var(--surface-muted)",
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
                          background: "var(--surface)",
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
          </section>
        </div>
      ) : null}
    </main>
  );
}
