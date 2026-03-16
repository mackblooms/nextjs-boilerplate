import type { SupabaseClient } from "@supabase/supabase-js";
import { withAvatarFallback } from "./avatar";
import { scoreTeamWins, type ScoringGame } from "./scoring";

type PoolLeaderboardRow = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
};

type EntryNameRow = {
  id: string;
  entry_name: string | null;
};

type ProfileLookupRow = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url?: string | null;
};

type EntryPickRow = {
  entry_id: string;
  team_id: string;
};

type TeamLookupRow = {
  id: string;
  name: string | null;
  seed_in_region: number | null;
  seed: number | null;
  cost: number | null;
  logo_url: string | null;
};

type GameRow = ScoringGame;

type RankedEntry = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string;
  entry_name: string | null;
  total_score: number;
  drafted_teams: PoolArchiveTeam[];
  rank: number;
};

const ROUND_ORDER: Record<string, number> = {
  R64: 1,
  R32: 2,
  S16: 3,
  E8: 4,
  F4: 5,
  CHIP: 6,
};

const ORDER_TO_ROUND: Record<number, string> = {
  1: "R64",
  2: "R32",
  3: "S16",
  4: "E8",
  5: "F4",
  6: "CHIP",
};

function isMissingAvatarColumnError(error: { message?: string; code?: string } | null) {
  return Boolean(
    error?.code === "PGRST204" &&
      error.message?.includes("profiles") &&
      error.message.includes("avatar_url"),
  );
}

function rankRows<T extends { total_score: number; entry_name: string | null; display_name: string | null }>(rows: T[]) {
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

function normalizeSeason(season: number) {
  const year = Math.trunc(season);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new Error("Season must be a year between 2000 and 2100.");
  }
  return year;
}

export type PoolArchiveTeam = {
  team_id: string;
  team_name: string;
  seed: number | null;
  cost: number | null;
  logo_url: string | null;
  round_reached: string | null;
  total_team_score: number;
};

export type PoolArchiveEntry = {
  entry_id: string;
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string;
  entry_name: string | null;
  total_score: number;
  rank: number;
  drafted_teams: PoolArchiveTeam[];
};

export type PoolArchiveSnapshot = {
  version: 1;
  season: number;
  captured_at: string;
  entries: PoolArchiveEntry[];
};

export async function isTournamentComplete(supabaseAdmin: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("games")
    .select("winner_team_id")
    .eq("round", "CHIP")
    .limit(1);

  if (error) {
    throw error;
  }

  const rows = (data as Array<{ winner_team_id: string | null }> | null) ?? [];
  return Boolean(rows[0]?.winner_team_id);
}

async function loadProfiles(
  supabaseAdmin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, { full_name: string | null; avatar_url: string | null }>> {
  if (userIds.length === 0) return new Map();

  let profileRows: ProfileLookupRow[] = [];

  while (true) {
    const withAvatar = await supabaseAdmin
      .from("profiles")
      .select("user_id,display_name,full_name,avatar_url")
      .in("user_id", userIds);

    if (!withAvatar.error) {
      profileRows = (withAvatar.data as ProfileLookupRow[] | null) ?? [];
      break;
    }

    if (!isMissingAvatarColumnError(withAvatar.error)) {
      throw withAvatar.error;
    }

    const fallback = await supabaseAdmin
      .from("profiles")
      .select("user_id,display_name,full_name")
      .in("user_id", userIds);

    if (fallback.error) {
      throw fallback.error;
    }

    profileRows = (fallback.data as ProfileLookupRow[] | null) ?? [];
    break;
  }

  return new Map(
    profileRows.map((row) => [
      row.user_id,
      {
        full_name: row.full_name ?? row.display_name,
        avatar_url: row.avatar_url ?? null,
      },
    ]),
  );
}

export async function buildPoolArchiveSnapshot(
  supabaseAdmin: SupabaseClient,
  poolId: string,
  season: number,
): Promise<PoolArchiveSnapshot> {
  const resolvedSeason = normalizeSeason(season);

  const { data: baseData, error: baseErr } = await supabaseAdmin
    .from("pool_leaderboard")
    .select("entry_id,user_id,display_name")
    .eq("pool_id", poolId);

  if (baseErr) {
    throw baseErr;
  }

  const baseRows = (baseData ?? []) as PoolLeaderboardRow[];
  const entryIds = baseRows.map((row) => row.entry_id);

  let entryNameById = new Map<string, string | null>();
  if (entryIds.length > 0) {
    const { data: entryRows, error: entryErr } = await supabaseAdmin
      .from("entries")
      .select("id,entry_name")
      .in("id", entryIds);

    if (entryErr) {
      throw entryErr;
    }

    entryNameById = new Map(
      (((entryRows as EntryNameRow[] | null) ?? []).map((row) => [row.id, row.entry_name])),
    );
  }

  const userIds = Array.from(new Set(baseRows.map((row) => row.user_id)));
  const profileByUser = await loadProfiles(supabaseAdmin, userIds);

  let pickRows: EntryPickRow[] = [];
  if (entryIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("entry_picks")
      .select("entry_id,team_id")
      .in("entry_id", entryIds);

    if (error) {
      throw error;
    }

    pickRows = (data as EntryPickRow[] | null) ?? [];
  }

  const teamIds = Array.from(new Set(pickRows.map((row) => row.team_id)));
  let teamRows: TeamLookupRow[] = [];
  if (teamIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("teams")
      .select("id,name,seed_in_region,seed,cost,logo_url")
      .in("id", teamIds);

    if (error) {
      throw error;
    }

    teamRows = (data as TeamLookupRow[] | null) ?? [];
  }

  const { data: gamesData, error: gamesErr } = await supabaseAdmin
    .from("games")
    .select("round,team1_id,team2_id,winner_team_id");

  if (gamesErr) {
    throw gamesErr;
  }

  const gameRows = (gamesData as GameRow[] | null) ?? [];

  const teamById = new Map(teamRows.map((row) => [row.id, row]));
  const teamSeedById = new Map(
    teamRows.map((row) => [row.id, row.seed_in_region ?? row.seed ?? null]),
  );

  const teamScores = scoreTeamWins(gameRows, teamSeedById);

  const roundReachedOrderByTeam = new Map<string, number>();
  for (const game of gameRows) {
    const order = ROUND_ORDER[game.round] ?? 0;
    if (!order) continue;

    for (const teamId of [game.team1_id, game.team2_id]) {
      if (!teamId) continue;
      const existing = roundReachedOrderByTeam.get(teamId) ?? 0;
      if (order > existing) {
        roundReachedOrderByTeam.set(teamId, order);
      }
    }
  }

  const draftedTeamsByEntry = new Map<string, PoolArchiveTeam[]>();
  for (const row of pickRows) {
    const team = teamById.get(row.team_id);
    if (!team) continue;

    const seed = team.seed_in_region ?? team.seed ?? null;
    const roundOrder = roundReachedOrderByTeam.get(row.team_id) ?? 0;

    const draftedTeam: PoolArchiveTeam = {
      team_id: row.team_id,
      team_name: team.name ?? "Unknown team",
      seed,
      cost: team.cost ?? null,
      logo_url: team.logo_url ?? null,
      round_reached: ORDER_TO_ROUND[roundOrder] ?? null,
      total_team_score: teamScores.get(row.team_id) ?? 0,
    };

    const current = draftedTeamsByEntry.get(row.entry_id) ?? [];
    current.push(draftedTeam);
    draftedTeamsByEntry.set(row.entry_id, current);
  }

  for (const teams of draftedTeamsByEntry.values()) {
    teams.sort(
      (a, b) =>
        (a.seed ?? 999) - (b.seed ?? 999) ||
        a.team_name.localeCompare(b.team_name),
    );
  }

  const computed = baseRows.map((row) => {
    const draftedTeams = draftedTeamsByEntry.get(row.entry_id) ?? [];
    const totalScore = draftedTeams.reduce((sum, team) => sum + team.total_team_score, 0);

    return {
      entry_id: row.entry_id,
      user_id: row.user_id,
      display_name: row.display_name,
      full_name: profileByUser.get(row.user_id)?.full_name ?? null,
      avatar_url: withAvatarFallback(
        row.user_id,
        profileByUser.get(row.user_id)?.avatar_url ?? null,
      ),
      entry_name: entryNameById.get(row.entry_id) ?? null,
      total_score: totalScore,
      drafted_teams: draftedTeams,
    };
  });

  const ranked: RankedEntry[] = rankRows(computed).map((row) => ({
    ...row,
    rank: row.rank,
  }));

  return {
    version: 1,
    season: resolvedSeason,
    captured_at: new Date().toISOString(),
    entries: ranked,
  };
}

export async function upsertPoolArchiveSnapshot(
  supabaseAdmin: SupabaseClient,
  poolId: string,
  season: number,
  createdBy: string | null,
): Promise<PoolArchiveSnapshot> {
  const snapshot = await buildPoolArchiveSnapshot(supabaseAdmin, poolId, season);

  const { error } = await supabaseAdmin.from("pool_archives").upsert(
    {
      pool_id: poolId,
      season: snapshot.season,
      snapshot,
      created_by: createdBy,
      updated_at: snapshot.captured_at,
    },
    { onConflict: "pool_id,season" },
  );

  if (error) {
    throw error;
  }

  return snapshot;
}
