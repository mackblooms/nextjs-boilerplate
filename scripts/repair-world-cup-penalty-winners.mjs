#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT } from "../lib/worldCupBracket.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MANUAL_RESULTS = [
  {
    round: "R32",
    slot: 13,
    team1: "Netherlands",
    team2: "Morocco",
    winner: "Morocco",
    team1Score: 1,
    team2Score: 1,
  },
  {
    round: "R32",
    slot: 16,
    team1: "Germany",
    team2: "Paraguay",
    winner: "Paraguay",
    team1Score: 1,
    team2Score: 1,
  },
];

function loadEnv() {
  try {
    const content = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = value;
    }
  } catch {
    // CI can provide real env vars instead.
  }
}

function norm(value) {
  return String(value ?? "").trim().toLowerCase();
}

function gameKey(round, slot) {
  return `${String(round ?? "").toUpperCase()}|${Number(slot)}`;
}

function requireTeamByName(teamsByName, name) {
  const team = teamsByName.get(norm(name));
  if (!team) throw new Error(`Could not find team "${name}".`);
  return team;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const db = createClient(url, key);
  const [teamsRes, gamesRes] = await Promise.all([
    db.from("teams").select("id,name").eq("competition_slug", "world-cup"),
    db
      .from("games")
      .select("id,round,slot,team1_id,team2_id,winner_team_id,competition_slug")
      .eq("competition_slug", "world-cup"),
  ]);
  if (teamsRes.error) throw teamsRes.error;
  if (gamesRes.error) throw gamesRes.error;

  const teams = teamsRes.data ?? [];
  const games = (gamesRes.data ?? []).map((game) => ({
    ...game,
    round: String(game.round ?? "").toUpperCase(),
    slot: Number(game.slot),
  }));
  const teamsByName = new Map(teams.map((team) => [norm(team.name), team]));
  const gamesByKey = new Map(games.map((game) => [gameKey(game.round, game.slot), game]));
  const nowIso = new Date().toISOString();

  let updatedResults = 0;
  for (const result of MANUAL_RESULTS) {
    const team1 = requireTeamByName(teamsByName, result.team1);
    const team2 = requireTeamByName(teamsByName, result.team2);
    const winner = requireTeamByName(teamsByName, result.winner);
    const game = gamesByKey.get(gameKey(result.round, result.slot));
    if (!game) throw new Error(`${result.round} slot ${result.slot} was not found.`);
    if (game.team1_id !== team1.id || game.team2_id !== team2.id) {
      throw new Error(
        `${result.round} slot ${result.slot} expected ${result.team1} vs ${result.team2}; found team IDs ${game.team1_id} vs ${game.team2_id}.`,
      );
    }

    const payload = {
      winner_team_id: winner.id,
      status: "Final",
      team1_score: result.team1Score,
      team2_score: result.team2Score,
      last_synced_at: nowIso,
    };
    const { error } = await db.from("games").update(payload).eq("id", game.id);
    if (error) throw error;
    game.winner_team_id = winner.id;
    updatedResults++;
    console.log(`  Set ${result.round} ${result.slot}: ${result.winner} advances.`);
  }

  let advancedSlotsUpdated = 0;
  let clearedInvalidWinners = 0;
  for (const source of [...games].sort((a, b) => a.slot - b.slot)) {
    const targetRef = WORLD_CUP_NEXT_TARGET_BY_ROUND_SLOT[gameKey(source.round, source.slot)];
    if (!targetRef) continue;
    const target = gamesByKey.get(gameKey(targetRef.round, targetRef.slot));
    if (!target) continue;

    const winnerId = source.winner_team_id ?? null;
    const payload = { last_synced_at: nowIso };
    if (target[targetRef.side] !== winnerId) {
      payload[targetRef.side] = winnerId;
      target[targetRef.side] = winnerId;
      advancedSlotsUpdated++;
    }

    const nextTeam1 = target.team1_id ?? null;
    const nextTeam2 = target.team2_id ?? null;
    if (target.winner_team_id && target.winner_team_id !== nextTeam1 && target.winner_team_id !== nextTeam2) {
      payload.winner_team_id = null;
      target.winner_team_id = null;
      clearedInvalidWinners++;
    }

    if (Object.keys(payload).length <= 1) continue;
    const { error } = await db.from("games").update(payload).eq("id", target.id);
    if (error) throw error;
  }

  console.log(`  Updated ${updatedResults} manual result(s).`);
  console.log(`  Propagated ${advancedSlotsUpdated} next-round slot(s).`);
  console.log(`  Cleared ${clearedInvalidWinners} stale winner(s).`);
}

main().catch((error) => {
  console.error("\nRepair failed:", error);
  process.exit(1);
});
