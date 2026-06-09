#!/usr/bin/env node
/**
 * Briefly mutates live World Cup data to verify group advancement, bracket
 * placement, and scoring, then restores the exact original rows.
 *
 * Run:
 *   node scripts/world-cup-live-smoke-test.mjs
 *
 * Optional:
 *   $env:TEST_HOLD_SECONDS="90"; node scripts/world-cup-live-smoke-test.mjs
 *   $env:TEST_TEAM_ID="<uuid>"; node scripts/world-cup-live-smoke-test.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnv() {
  try {
    const content = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env.local may not exist in CI; rely on real env vars.
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const holdSeconds = Math.max(5, Math.min(600, Number(process.env.TEST_HOLD_SECONDS ?? 90) || 90));
const requestedTeamId = process.env.TEST_TEAM_ID?.trim() || null;

const FIXED_R32_TARGETS = {
  "1A": { slot: 7, side: "team1_id" },
  "1B": { slot: 13, side: "team1_id" },
  "1C": { slot: 4, side: "team1_id" },
  "1D": { slot: 9, side: "team1_id" },
  "1E": { slot: 2, side: "team1_id" },
  "1F": { slot: 3, side: "team1_id" },
  "1G": { slot: 10, side: "team1_id" },
  "1H": { slot: 12, side: "team1_id" },
  "1I": { slot: 5, side: "team1_id" },
  "1J": { slot: 14, side: "team1_id" },
  "1K": { slot: 15, side: "team1_id" },
  "1L": { slot: 8, side: "team1_id" },
};

const WC_WIN_PTS = { R32: 18, S16: 30, E8: 48, F4: 72, CHIP: 100 };
const WC_LONGSHOT_BONUS = { GROUP_ADVANCE: 25, R32: 50, S16: 75, E8: 100, F4: 150, CHIP: 200 };
const WC_VALUE_BONUS = { GROUP_ADVANCE: 5, R32: 10, S16: 20, E8: 40, F4: 80, CHIP: 160 };

function groupCode(region) {
  const match = String(region ?? "").trim().match(/group\s+([A-L])$/i);
  return match ? match[1].toUpperCase() : null;
}

function valueBonus(cost, round) {
  if (typeof cost !== "number" || !Number.isFinite(cost)) return 0;
  if (cost <= 5) return WC_LONGSHOT_BONUS[round] ?? 0;
  if (cost <= 10) return WC_VALUE_BONUS[round] ?? 0;
  return 0;
}

function scoreTeamWins(games, costById) {
  const totals = new Map();
  const advanceAwarded = new Set();
  for (const game of games) {
    const round = String(game.round ?? "").toUpperCase();
    if (round === "GROUP") {
      if (game.winner_team_id) {
        totals.set(game.winner_team_id, (totals.get(game.winner_team_id) ?? 0) + 6);
        continue;
      }
      if (
        String(game.status ?? "").toLowerCase().startsWith("final") &&
        typeof game.team1_score === "number" &&
        game.team1_score === game.team2_score
      ) {
        for (const teamId of [game.team1_id, game.team2_id]) {
          if (teamId) totals.set(teamId, (totals.get(teamId) ?? 0) + 2);
        }
      }
      continue;
    }
    if (round === "R32") {
      for (const teamId of [game.team1_id, game.team2_id]) {
        if (!teamId || advanceAwarded.has(teamId)) continue;
        advanceAwarded.add(teamId);
        totals.set(teamId, (totals.get(teamId) ?? 0) + 12 + valueBonus(costById.get(teamId), "GROUP_ADVANCE"));
      }
    }
    if (!game.winner_team_id) continue;
    const base = WC_WIN_PTS[round] ?? 0;
    if (!base) continue;
    totals.set(game.winner_team_id, (totals.get(game.winner_team_id) ?? 0) + base + valueBonus(costById.get(game.winner_team_id), round));
  }
  return totals;
}

function scoreEntries(games, teams, picksByEntry) {
  const costById = new Map(teams.map((team) => [team.id, team.cost ?? null]));
  const teamScores = scoreTeamWins(games, costById);
  const out = new Map();
  for (const [entryId, picks] of picksByEntry) {
    const unique = [...new Set(picks.filter(Boolean))];
    out.set(entryId, unique.reduce((sum, teamId) => sum + (teamScores.get(teamId) ?? 0), 0));
  }
  return { teamScores, entryScores: out };
}

async function must(label, query) {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function wait(seconds) {
  await new Promise((resolveWait) => setTimeout(resolveWait, seconds * 1000));
}

async function main() {
  console.log("=== World Cup Live Smoke Test ===");
  console.log(`Hold window: ${holdSeconds}s\n`);

  const [teams, leaderboardRows] = await Promise.all([
    must("teams", db.from("teams").select("id,name,region,cost,competition_slug").eq("competition_slug", "world-cup")),
    must("pool leaderboard", db.from("pool_leaderboard").select("entry_id,pool_id,display_name").limit(500)),
  ]);

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const wcEntryIds = [...new Set((leaderboardRows ?? []).map((row) => row.entry_id).filter(Boolean))];
  if (wcEntryIds.length === 0) throw new Error("No pool entries found to score.");

  const pickRows = await must(
    "entry picks",
    db.from("entry_picks").select("entry_id,team_id").in("entry_id", wcEntryIds),
  );
  const picksByEntry = new Map(wcEntryIds.map((entryId) => [entryId, []]));
  for (const row of pickRows ?? []) {
    const arr = picksByEntry.get(row.entry_id) ?? [];
    arr.push(row.team_id);
    picksByEntry.set(row.entry_id, arr);
  }

  const pickedTeamIds = [...new Set((pickRows ?? []).map((row) => row.team_id).filter(Boolean))];
  const targetTeam =
    (requestedTeamId ? teamById.get(requestedTeamId) : null) ??
    pickedTeamIds.map((teamId) => teamById.get(teamId)).find((team) => team && FIXED_R32_TARGETS[`1${groupCode(team.region)}`]);
  if (!targetTeam) throw new Error("Could not find a drafted World Cup team with a fixed first-place R32 slot.");

  const group = groupCode(targetTeam.region);
  const target = FIXED_R32_TARGETS[`1${group}`];
  if (!group || !target) throw new Error(`No first-place R32 target found for ${targetTeam.name}.`);

  const groupGames = await must(
    "group games",
    db.from("games")
      .select("id,round,region,slot,status,team1_id,team2_id,winner_team_id,team1_score,team2_score,last_synced_at,competition_slug")
      .eq("competition_slug", "world-cup")
      .eq("round", "GROUP")
      .eq("region", `Group ${group}`)
      .order("slot"),
  );
  if ((groupGames ?? []).length !== 6) {
    throw new Error(`Expected 6 games for Group ${group}, found ${(groupGames ?? []).length}.`);
  }

  const r32Rows = await must(
    "r32 target",
    db.from("games")
      .select("id,round,region,slot,status,team1_id,team2_id,winner_team_id,team1_score,team2_score,last_synced_at,competition_slug")
      .eq("competition_slug", "world-cup")
      .eq("round", "R32")
      .eq("slot", target.slot),
  );
  const r32Game = r32Rows?.[0];
  if (!r32Game) throw new Error(`R32 slot ${target.slot} was not found.`);

  const gameIds = [...groupGames.map((game) => game.id), r32Game.id];
  const originals = new Map([...groupGames, r32Game].map((game) => [game.id, { ...game }]));

  let restored = false;
  async function restore() {
    if (restored) return;
    restored = true;
    console.log("\nRestoring original live rows...");
    for (const gameId of gameIds) {
      const original = originals.get(gameId);
      const { error } = await db
        .from("games")
        .update({
          status: original.status,
          team1_id: original.team1_id,
          team2_id: original.team2_id,
          winner_team_id: original.winner_team_id,
          team1_score: original.team1_score,
          team2_score: original.team2_score,
          last_synced_at: original.last_synced_at,
        })
        .eq("id", gameId);
      if (error) throw new Error(`restore ${gameId}: ${error.message}`);
    }
    console.log("Restore complete.");
  }

  try {
    console.log(`Test team: ${targetTeam.name} (${targetTeam.id})`);
    console.log(`Scenario: ${targetTeam.name} wins Group ${group} and should fill R32 slot ${target.slot} ${target.side}.`);

    for (const game of groupGames) {
      const targetIsTeam1 = game.team1_id === targetTeam.id;
      const targetIsTeam2 = game.team2_id === targetTeam.id;
      const team1Score = targetIsTeam1 ? 2 : targetIsTeam2 ? 0 : 1;
      const team2Score = targetIsTeam1 ? 0 : targetIsTeam2 ? 2 : 0;
      const winnerTeamId = targetIsTeam1 ? game.team1_id : targetIsTeam2 ? game.team2_id : game.team1_id;
      const { error } = await db
        .from("games")
        .update({
          status: "Final",
          team1_score: team1Score,
          team2_score: team2Score,
          winner_team_id: winnerTeamId,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", game.id);
      if (error) throw new Error(`update group game ${game.id}: ${error.message}`);
    }

    const nextR32 = { [target.side]: targetTeam.id, winner_team_id: null, last_synced_at: new Date().toISOString() };
    const { error: r32Error } = await db.from("games").update(nextR32).eq("id", r32Game.id);
    if (r32Error) throw new Error(`update R32 slot ${target.slot}: ${r32Error.message}`);

    const testGames = await must(
      "test games",
      db.from("games")
        .select("id,round,region,slot,status,team1_id,team2_id,winner_team_id,team1_score,team2_score,competition_slug")
        .eq("competition_slug", "world-cup"),
    );
    const { teamScores, entryScores } = scoreEntries(testGames, teams, picksByEntry);

    const targetPoints = teamScores.get(targetTeam.id) ?? 0;
    const impactedEntries = [...picksByEntry.entries()]
      .filter(([, teamIds]) => teamIds.includes(targetTeam.id))
      .map(([entryId]) => ({
        entryId,
        label: leaderboardRows.find((row) => row.entry_id === entryId)?.display_name?.trim() || entryId.slice(0, 8),
        score: entryScores.get(entryId) ?? 0,
      }));

    const verifiedR32 = testGames.find((game) => String(game.round).toUpperCase() === "R32" && Number(game.slot) === target.slot);
    console.log("\nVerification while live:");
    console.log(`  R32 slot ${target.slot} ${target.side}: ${verifiedR32?.[target.side] === targetTeam.id ? "OK" : "FAILED"}`);
    console.log(`  ${targetTeam.name} points: ${targetPoints}`);
    for (const entry of impactedEntries) {
      console.log(`  Entry score (${entry.label}): ${entry.score}`);
    }
    if (impactedEntries.length === 0) {
      console.log("  No current pool entry drafted this team; bracket placement was still tested.");
    }

    console.log(`\nLive test state is visible for ${holdSeconds}s. Refresh the bracket/leaderboard now if you want to see it.`);
    await wait(holdSeconds);
  } finally {
    await restore();
  }

  console.log("\n=== Smoke test complete ===");
}

main().catch((error) => {
  console.error("\nSmoke test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
