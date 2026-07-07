#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { scoreEntries, scoreTeamWinsDetailed } from "../lib/scoring.ts";
import { applyWorldCupManualResultOverrides } from "../lib/worldCupManualResults.js";

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

function normalizeRound(round) {
  return String(round ?? "").trim().toUpperCase();
}

function isMissingColumnError(error, column) {
  const message = error?.message ?? "";
  return (
    message.includes(`column entries.${column} does not exist`) ||
    message.includes(`Could not find the '${column}' column of 'entries' in the schema cache`)
  );
}

function setKey(values) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort().join("|");
}

function teamLabel(team) {
  if (!team) return "(unknown team)";
  const cost = typeof team.cost === "number" ? `$${team.cost}` : "$?";
  return `${team.name} (${cost})`;
}

function getEliminatedTeamIds(games) {
  const eliminated = new Set();
  for (const game of games) {
    if (normalizeRound(game.round) === "GROUP") continue;
    if (!game.winner_team_id || !game.team1_id || !game.team2_id) continue;
    if (game.winner_team_id === game.team1_id) eliminated.add(game.team2_id);
    if (game.winner_team_id === game.team2_id) eliminated.add(game.team1_id);
  }
  return eliminated;
}

async function loadEntries(db, entryIds) {
  if (entryIds.length === 0) return new Map();

  let result = await db.from("entries").select("id,entry_name,saved_draft_id").in("id", entryIds);
  if (result.error && isMissingColumnError(result.error, "entry_name")) {
    result = await db.from("entries").select("id,saved_draft_id").in("id", entryIds);
  }
  if (result.error && isMissingColumnError(result.error, "saved_draft_id")) {
    result = await db.from("entries").select("id,entry_name").in("id", entryIds);
  }
  if (result.error) throw result.error;

  return new Map((result.data ?? []).map((entry) => [entry.id, entry]));
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const db = createClient(url, key);
  const [gamesRes, teamsRes, poolsRes] = await Promise.all([
    db
      .from("games")
      .select("id,round,region,slot,status,team1_id,team2_id,winner_team_id,team1_score,team2_score,competition_slug")
      .eq("competition_slug", "world-cup"),
    db
      .from("teams")
      .select("id,name,seed_in_region,region,cost,competition_slug")
      .eq("competition_slug", "world-cup"),
    db
      .from("pools")
      .select("id,name,competition_slug")
      .eq("competition_slug", "world-cup")
      .order("name"),
  ]);

  if (gamesRes.error) throw gamesRes.error;
  if (teamsRes.error) throw teamsRes.error;
  if (poolsRes.error) throw poolsRes.error;

  const games = applyWorldCupManualResultOverrides((gamesRes.data ?? []).map((game) => ({
    ...game,
    round: normalizeRound(game.round),
  })));
  const teams = teamsRes.data ?? [];
  const pools = poolsRes.data ?? [];
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const teamSeedById = new Map(teams.map((team) => [team.id, team.seed_in_region ?? null]));
  const teamCostById = new Map(teams.map((team) => [team.id, team.cost ?? null]));
  const eliminatedTeamIds = getEliminatedTeamIds(games);
  const gameTeamIds = new Set();
  for (const game of games) {
    if (game.team1_id) gameTeamIds.add(game.team1_id);
    if (game.team2_id) gameTeamIds.add(game.team2_id);
    if (game.winner_team_id) gameTeamIds.add(game.winner_team_id);
  }

  const scoringOptions = { competitionSlug: "world-cup", teamCostById };
  const teamScoring = scoreTeamWinsDetailed(games, teamSeedById, scoringOptions);

  console.log("=== World Cup Leaderboard Points Audit ===");
  console.log(`    ${new Date().toISOString()}\n`);
  console.log(`  Loaded ${games.length} games, ${teams.length} teams, ${pools.length} pool(s)`);

  const completedKnockout = games
    .filter((game) => normalizeRound(game.round) !== "GROUP" && game.winner_team_id)
    .sort((a, b) => {
      const order = { R32: 1, S16: 2, E8: 3, F4: 4, CHIP: 5 };
      return (order[a.round] ?? 99) - (order[b.round] ?? 99) || Number(a.slot ?? 0) - Number(b.slot ?? 0);
    });

  console.log("\n--- Completed Knockout Results Feeding Scores ---");
  if (completedKnockout.length === 0) {
    console.log("  No completed knockout games yet.");
  } else {
    for (const game of completedKnockout) {
      const team1 = teamById.get(game.team1_id);
      const team2 = teamById.get(game.team2_id);
      const winner = teamById.get(game.winner_team_id);
      const score =
        typeof game.team1_score === "number" && typeof game.team2_score === "number"
          ? ` ${game.team1_score}-${game.team2_score}`
          : "";
      console.log(
        `  ${game.round} ${game.slot}: ${team1?.name ?? game.team1_id} vs ${team2?.name ?? game.team2_id}${score} -> ${winner?.name ?? game.winner_team_id}`,
      );
    }
  }

  let totalIssues = 0;
  for (const pool of pools) {
    console.log(`\n--- Pool: ${pool.name} ---`);
    const lbRes = await db
      .from("pool_leaderboard")
      .select("entry_id,user_id,display_name")
      .eq("pool_id", pool.id);
    if (lbRes.error) throw lbRes.error;

    const baseRows = lbRes.data ?? [];
    const entryIds = baseRows.map((row) => row.entry_id);
    if (entryIds.length === 0) {
      console.log("  No entries.");
      continue;
    }

    const [picksRes, entriesById] = await Promise.all([
      db.from("entry_picks").select("entry_id,team_id").in("entry_id", entryIds),
      loadEntries(db, entryIds),
    ]);
    if (picksRes.error) throw picksRes.error;

    const picksByEntry = new Map(entryIds.map((entryId) => [entryId, []]));
    for (const row of picksRes.data ?? []) {
      const picks = picksByEntry.get(row.entry_id) ?? [];
      picks.push(row.team_id);
      picksByEntry.set(row.entry_id, picks);
    }

    const linkedDraftIds = [
      ...new Set(
        [...entriesById.values()]
          .map((entry) => entry.saved_draft_id)
          .filter((draftId) => typeof draftId === "string" && draftId.trim()),
      ),
    ];
    const draftPicksByDraft = new Map(linkedDraftIds.map((draftId) => [draftId, []]));
    if (linkedDraftIds.length > 0) {
      const draftPickRes = await db
        .from("saved_draft_picks")
        .select("draft_id,team_id")
        .in("draft_id", linkedDraftIds);
      if (draftPickRes.error) throw draftPickRes.error;
      for (const row of draftPickRes.data ?? []) {
        const picks = draftPicksByDraft.get(row.draft_id) ?? [];
        picks.push(row.team_id);
        draftPicksByDraft.set(row.draft_id, picks);
      }
    }

    const scored = scoreEntries(games, teamSeedById, picksByEntry, scoringOptions);
    const rows = baseRows
      .map((row) => {
        const entry = entriesById.get(row.entry_id);
        const picks = [...new Set(picksByEntry.get(row.entry_id) ?? [])];
        const teamTotals = picks
          .map((teamId) => {
            const team = teamById.get(teamId);
            return {
              teamId,
              teamName: team?.name ?? teamId,
              points: scored.teamScoresByTeamId.get(teamId) ?? 0,
              cost: team?.cost ?? null,
              active: gameTeamIds.has(teamId) && !eliminatedTeamIds.has(teamId),
              inBracket: gameTeamIds.has(teamId),
            };
          })
          .sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName));
        return {
          entryId: row.entry_id,
          label:
            entry?.entry_name?.trim() ||
            row.display_name?.trim() ||
            row.entry_id.slice(0, 8),
          score: scored.totalScoreByEntryId.get(row.entry_id) ?? 0,
          activeTeams: teamTotals.filter((team) => team.active).length,
          teamTotals,
          savedDraftId: entry?.saved_draft_id ?? null,
        };
      })
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

    let prevScore = null;
    let prevRank = 0;
    rows.forEach((row, index) => {
      const rank = prevScore === row.score ? prevRank : index + 1;
      prevScore = row.score;
      prevRank = rank;

      const pickSum = row.teamTotals.reduce((sum, team) => sum + team.points, 0);
      if (pickSum !== row.score) {
        totalIssues++;
        console.log(`  ✗ ${row.label}: total ${row.score} does not match team sum ${pickSum}`);
      }

      const missingPicks = row.teamTotals.length === 0;
      if (missingPicks) {
        totalIssues++;
        console.log(`  ✗ ${row.label}: no persisted entry picks`);
      }

      const orphanTeams = row.teamTotals.filter((team) => !team.inBracket);
      if (orphanTeams.length > 0) {
        totalIssues += orphanTeams.length;
        console.log(
          `  ✗ ${row.label}: ${orphanTeams.length} pick(s) are not present in World Cup game data: ${orphanTeams.map((team) => team.teamName).join(", ")}`,
        );
      }

      if (row.savedDraftId) {
        const entryKey = setKey(picksByEntry.get(row.entryId) ?? []);
        const draftKey = setKey(draftPicksByDraft.get(row.savedDraftId) ?? []);
        if (draftKey && entryKey !== draftKey) {
          console.log(
            `  ⚠ ${row.label}: linked saved draft differs; scoring is using persisted entry picks.`,
          );
        }
      }

      const teamsText = row.teamTotals
        .map((team) => {
          const status = team.active ? "alive" : team.inBracket ? "out" : "not in bracket";
          const cost = typeof team.cost === "number" ? `$${team.cost}` : "$?";
          return `${team.teamName} ${team.points} (${cost}, ${status})`;
        })
        .join("; ");
      console.log(
        `  ${String(rank).padStart(2)}. ${String(row.score).padStart(4)} pts | ${row.activeTeams} alive | ${row.label}`,
      );
      console.log(`      ${teamsText || "(no teams)"}`);
    });
  }

  console.log("\n--- Team Point Totals ---");
  const teamPointRows = [...teamScoring.teamScoresByTeamId.entries()]
    .map(([teamId, points]) => ({
      team: teamById.get(teamId),
      teamId,
      points,
    }))
    .sort((a, b) => b.points - a.points || teamLabel(a.team).localeCompare(teamLabel(b.team)));
  for (const row of teamPointRows) {
    console.log(`  ${String(row.points).padStart(4)}  ${teamLabel(row.team)} (${row.teamId})`);
  }

  console.log("\n--- Summary ---");
  if (totalIssues === 0) {
    console.log("  ✓ Every entry total matches the sum of its persisted drafted teams.");
    console.log("  ✓ No missing entry picks or orphan World Cup picks found.");
  } else {
    console.log(`  ✗ ${totalIssues} issue(s) found.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nAudit failed:", error);
  process.exit(1);
});
