import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

type RepairSeedsRequest = {
  poolId?: string;
  userId?: string;
};

type RegionName = "East" | "West" | "South" | "Midwest";

type R64GameRow = {
  id: string;
  region: string | null;
  slot: number | null;
  team1_id: string | null;
  team2_id: string | null;
};

type TeamRow = {
  id: string;
  region: string | null;
  seed: number | null;
  seed_in_region: number | null;
  cost: number | null;
};

type DesiredTeamState = {
  seed: number;
  region: RegionName;
  cost: number | null;
};

function toSeed(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const seed = Math.trunc(n);
  if (seed < 1 || seed > 16) return null;
  return seed;
}

function toInt(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function isRegionName(value: string | null): value is RegionName {
  return value === "East" || value === "West" || value === "South" || value === "Midwest";
}

function expectedSeedsForR64Slot(slot: number): [number, number] | null {
  const map: Record<number, [number, number]> = {
    1: [1, 16],
    2: [8, 9],
    3: [5, 12],
    4: [4, 13],
    5: [6, 11],
    6: [3, 14],
    7: [7, 10],
    8: [2, 15],
  };
  return map[slot] ?? null;
}

function costForSeed(seed: number | null): number | null {
  if (!seed) return null;
  const map: Record<number, number> = {
    1: 30,
    2: 27,
    3: 24,
    4: 22,
    5: 20,
    6: 18,
    7: 16,
    8: 14,
    9: 12,
    10: 10,
    11: 8,
    12: 6,
    13: 5,
    14: 4,
    15: 3,
    16: 2,
  };
  return map[seed] ?? null;
}

function desiredStateKey(state: DesiredTeamState) {
  return `${state.region}|${state.seed}|${state.cost ?? "null"}`;
}

function parseDesiredStateKey(key: string): DesiredTeamState | null {
  const [regionRaw, seedRaw, costRaw] = key.split("|");
  if (!isRegionName(regionRaw as string | null)) return null;
  const region = regionRaw as RegionName;
  const seed = toSeed(seedRaw);
  if (!seed) return null;
  const cost = costRaw === "null" ? null : toInt(costRaw);
  return { region, seed, cost };
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const body = (await req.json().catch(() => ({}))) as RepairSeedsRequest;
    const poolId = body.poolId?.trim();
    const userId = body.userId?.trim();

    if (!poolId || !userId) {
      return NextResponse.json({ error: "missing poolId/userId" }, { status: 400 });
    }

    const { data: poolRow, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("created_by")
      .eq("id", poolId)
      .single();
    if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 400 });
    if (poolRow.created_by !== userId) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    const { data: r64Rows, error: r64Err } = await supabaseAdmin
      .from("games")
      .select("id,region,slot,team1_id,team2_id")
      .eq("round", "R64");
    if (r64Err) throw r64Err;

    const games = (r64Rows ?? []) as R64GameRow[];
    const allTeamIds = Array.from(
      new Set(
        games
          .flatMap((g) => [g.team1_id, g.team2_id])
          .filter((id): id is string => !!id)
      )
    );

    const teamById = new Map<string, TeamRow>();
    if (allTeamIds.length > 0) {
      const { data: teamRows, error: teamErr } = await supabaseAdmin
        .from("teams")
        .select("id,region,seed,seed_in_region,cost")
        .in("id", allTeamIds);
      if (teamErr) throw teamErr;
      for (const row of (teamRows ?? []) as TeamRow[]) {
        teamById.set(String(row.id), row);
      }
    }

    let scannedGames = 0;
    let gamesEligible = 0;
    let gamesOrderFixed = 0;
    let gamesMissingTeams = 0;
    let gamesInvalidRegionOrSlot = 0;

    const assignmentsByTeamId = new Map<string, DesiredTeamState[]>();

    for (const row of games) {
      scannedGames++;
      const slot = Number(row.slot);
      if (!isRegionName(row.region) || !Number.isFinite(slot)) {
        gamesInvalidRegionOrSlot++;
        continue;
      }

      const slotSeedPair = expectedSeedsForR64Slot(Math.trunc(slot));
      if (!slotSeedPair) {
        gamesInvalidRegionOrSlot++;
        continue;
      }

      const team1Id = row.team1_id ? String(row.team1_id) : null;
      const team2Id = row.team2_id ? String(row.team2_id) : null;
      if (!team1Id || !team2Id) {
        gamesMissingTeams++;
        continue;
      }

      gamesEligible++;
      const t1 = teamById.get(team1Id) ?? null;
      const t2 = teamById.get(team2Id) ?? null;
      const s1 = toSeed(t1?.seed_in_region) ?? toSeed(t1?.seed);
      const s2 = toSeed(t2?.seed_in_region) ?? toSeed(t2?.seed);

      let desiredTopId = team1Id;
      let desiredBottomId = team2Id;
      const [topSeed, bottomSeed] = slotSeedPair;

      // Keep lower-seed team in team1/team-top when we can infer ordering.
      if (s1 != null && s2 != null && s1 > s2) {
        desiredTopId = team2Id;
        desiredBottomId = team1Id;
      } else if (s1 === bottomSeed && s2 === topSeed) {
        desiredTopId = team2Id;
        desiredBottomId = team1Id;
      }

      if (desiredTopId !== team1Id || desiredBottomId !== team2Id) {
        const { error: swapErr } = await supabaseAdmin
          .from("games")
          .update({
            team1_id: desiredTopId,
            team2_id: desiredBottomId,
          })
          .eq("id", String(row.id));
        if (swapErr) throw swapErr;
        gamesOrderFixed++;
      }

      const topDesired: DesiredTeamState = {
        seed: topSeed,
        region: row.region,
        cost: costForSeed(topSeed),
      };
      const bottomDesired: DesiredTeamState = {
        seed: bottomSeed,
        region: row.region,
        cost: costForSeed(bottomSeed),
      };

      assignmentsByTeamId.set(desiredTopId, [...(assignmentsByTeamId.get(desiredTopId) ?? []), topDesired]);
      assignmentsByTeamId.set(desiredBottomId, [...(assignmentsByTeamId.get(desiredBottomId) ?? []), bottomDesired]);
    }

    let teamsUpdated = 0;
    let teamSeedFieldsUpdated = 0;
    let teamRegionUpdated = 0;
    let teamCostUpdated = 0;
    let teamsWithConflicts = 0;
    let teamsConflictResolved = 0;

    const desiredByTeamId = new Map<string, DesiredTeamState>();
    for (const [teamId, assignments] of assignmentsByTeamId.entries()) {
      if (assignments.length === 0) continue;
      const counts = new Map<string, number>();
      for (const assignment of assignments) {
        const key = desiredStateKey(assignment);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      if (counts.size > 1) teamsWithConflicts++;

      let bestKey: string | null = null;
      let bestCount = -1;
      for (const [key, count] of counts.entries()) {
        if (count > bestCount) {
          bestKey = key;
          bestCount = count;
          continue;
        }
        if (count === bestCount && bestKey && key < bestKey) {
          bestKey = key;
        }
      }

      if (!bestKey) continue;
      const resolved = parseDesiredStateKey(bestKey);
      if (!resolved) continue;
      if (counts.size > 1) teamsConflictResolved++;
      desiredByTeamId.set(teamId, resolved);
    }

    for (const [teamId, desired] of desiredByTeamId.entries()) {

      const existing = teamById.get(teamId);
      if (!existing) continue;

      const updates: Record<string, unknown> = {};
      const existingSeed = toSeed(existing.seed);
      const existingSeedInRegion = toSeed(existing.seed_in_region);
      const existingCost = toInt(existing.cost);

      if (existingSeed !== desired.seed || existingSeedInRegion !== desired.seed) {
        updates.seed = desired.seed;
        updates.seed_in_region = desired.seed;
        teamSeedFieldsUpdated++;
      }

      if (existing.region !== desired.region) {
        updates.region = desired.region;
        teamRegionUpdated++;
      }

      if (existingCost !== desired.cost) {
        updates.cost = desired.cost;
        teamCostUpdated++;
      }

      if (Object.keys(updates).length === 0) continue;

      const { error: updErr } = await supabaseAdmin
        .from("teams")
        .update(updates)
        .eq("id", teamId);
      if (updErr) throw updErr;
      teamsUpdated++;
    }

    // Repair leftover rows where seed is valid but seed_in_region is invalid (0/null/out of range).
    let teamsSeedInRegionBackfilled = 0;
    const { data: invalidSeedRows, error: invalidSeedRowsErr } = await supabaseAdmin
      .from("teams")
      .select("id,seed,seed_in_region")
      .or("seed_in_region.eq.0,seed_in_region.is.null");
    if (invalidSeedRowsErr) throw invalidSeedRowsErr;

    for (const row of (invalidSeedRows ?? []) as Array<{ id: string; seed: number | null; seed_in_region: number | null }>) {
      const seed = toSeed(row.seed);
      if (!seed) continue;
      if (toSeed(row.seed_in_region) === seed) continue;
      const { error: backfillErr } = await supabaseAdmin
        .from("teams")
        .update({ seed_in_region: seed })
        .eq("id", String(row.id));
      if (backfillErr) throw backfillErr;
      teamsSeedInRegionBackfilled++;
    }

    return NextResponse.json({
      ok: true,
      scannedGames,
      gamesEligible,
      gamesOrderFixed,
      gamesMissingTeams,
      gamesInvalidRegionOrSlot,
      teamsUpdated,
      teamSeedFieldsUpdated,
      teamRegionUpdated,
      teamCostUpdated,
      teamsWithConflicts,
      teamsConflictResolved,
      teamsSeedInRegionBackfilled,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}
