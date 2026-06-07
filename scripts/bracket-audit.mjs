#!/usr/bin/env node
/**
 * Bracket & Scoring Audit
 * Run: npm run audit:bracket
 *
 * Checks:
 *  1. Bracket advancement — every winner is in the correct next-round slot
 *  2. Stale winners     — winner_team_id not matching either team in the game
 *  3. Orphan picks      — entry picks referencing team IDs absent from all games
 *  4. Leaderboard       — recomputed scores for each pool (top 5 shown)
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --------------------------------------------------------------------------
// Load .env.local
// --------------------------------------------------------------------------

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
    // .env.local may not exist in CI; rely on real env vars
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

// --------------------------------------------------------------------------
// Inlined scoring logic (mirrors lib/scoring.ts)
// --------------------------------------------------------------------------

const BASE_PTS = { R64: 12, R32: 36, S16: 84, E8: 180, F4: 300, CHIP: 360 };
const WC_WIN_PTS = { R32: 18, S16: 30, E8: 48, F4: 72, CHIP: 100 };
const WC_LONGSHOT_BONUS = { GROUP_ADVANCE: 25, R32: 50, S16: 75, E8: 100, F4: 150, CHIP: 200 };
const WC_VALUE_BONUS = { GROUP_ADVANCE: 5, R32: 10, S16: 20, E8: 40, F4: 80, CHIP: 160 };
const HISTORIC = { 14: 24, 15: 40, 16: 56 };

function seedMult(seed) {
  if (!seed || seed < 1 || seed > 16) return 1;
  return 1 + (seed - 1) * 0.035;
}

function isFinal(status) {
  return String(status ?? "").trim().toLowerCase().startsWith("final");
}

function wcValuePickBonus(cost, round) {
  if (cost == null) return 0;
  if (cost <= 5) return WC_LONGSHOT_BONUS[round] ?? 0;
  if (cost <= 10) return WC_VALUE_BONUS[round] ?? 0;
  return 0;
}

function scoreTeamWinsMM(games, seedById) {
  const totals = new Map();
  const historicAwarded = new Set();
  for (const g of games) {
    const winnerId = g.winner_team_id;
    if (!winnerId) continue;
    const base = BASE_PTS[String(g.round ?? "").toUpperCase()] ?? 0;
    if (!base) continue;
    const ws = seedById.get(winnerId) ?? null;
    const oppId = g.team1_id === winnerId ? g.team2_id : g.team1_id;
    const os = oppId ? (seedById.get(oppId) ?? null) : null;
    const mult = seedMult(ws);
    const upset = ws && os ? Math.max(0, 4 * (ws - os)) : 0;
    let historic = 0;
    if (String(g.round).toUpperCase() === "R64" && ws && HISTORIC[ws] && !historicAwarded.has(winnerId)) {
      historic = HISTORIC[ws];
      historicAwarded.add(winnerId);
    }
    totals.set(winnerId, (totals.get(winnerId) ?? 0) + Math.round(base * mult + upset + historic));
  }
  return totals;
}

function scoreTeamWinsWC(games, costById) {
  const totals = new Map();
  const advanceAwarded = new Set();
  for (const g of games) {
    const round = String(g.round ?? "").toUpperCase();
    if (round === "GROUP") {
      if (g.winner_team_id) {
        totals.set(g.winner_team_id, (totals.get(g.winner_team_id) ?? 0) + 6);
        continue;
      }
      if (isFinal(g.status) && g.team1_score === g.team2_score && g.team1_score != null) {
        for (const id of [g.team1_id, g.team2_id]) {
          if (!id) continue;
          totals.set(id, (totals.get(id) ?? 0) + 2);
        }
      }
      continue;
    }
    if (round === "R32") {
      for (const id of [g.team1_id, g.team2_id]) {
        if (!id || advanceAwarded.has(id)) continue;
        advanceAwarded.add(id);
        const cost = costById?.get(id) ?? null;
        const breakout = wcValuePickBonus(cost, "GROUP_ADVANCE");
        totals.set(id, (totals.get(id) ?? 0) + 12 + breakout);
      }
    }
    const winnerId = g.winner_team_id;
    if (!winnerId) continue;
    const base = WC_WIN_PTS[round] ?? 0;
    if (!base) continue;
    const cost = costById?.get(winnerId) ?? null;
    const valueRun = wcValuePickBonus(cost, round);
    totals.set(winnerId, (totals.get(winnerId) ?? 0) + base + valueRun);
  }
  return totals;
}

function computeEntryScores(games, teamScores, seedById, picksByEntry, isWC) {
  const r64Winners = new Set();
  if (!isWC) {
    for (const g of games) {
      if (String(g.round).toUpperCase() === "R64" && g.winner_team_id) r64Winners.add(g.winner_team_id);
    }
  }
  const result = new Map();
  for (const [entryId, rawPicks] of picksByEntry) {
    const picks = [...new Set(rawPicks.filter(Boolean))];
    let total = picks.reduce((s, id) => s + (teamScores.get(id) ?? 0), 0);
    if (!isWC && picks.length > 0 && picks.every((id) => r64Winners.has(id))) {
      total += picks.reduce((s, id) => s + (seedById.get(id) ?? 0), 0);
    }
    result.set(entryId, total);
  }
  return result;
}

// --------------------------------------------------------------------------
// Inlined bracket propagation logic (mirrors set-game-winner/route.ts)
// --------------------------------------------------------------------------

const WC_NEXT = {
  "R32|1": { round: "S16", slot: 2, side: "team1_id" },
  "R32|2": { round: "S16", slot: 1, side: "team1_id" },
  "R32|3": { round: "S16", slot: 2, side: "team2_id" },
  "R32|4": { round: "S16", slot: 3, side: "team1_id" },
  "R32|5": { round: "S16", slot: 1, side: "team2_id" },
  "R32|6": { round: "S16", slot: 3, side: "team2_id" },
  "R32|7": { round: "S16", slot: 4, side: "team1_id" },
  "R32|8": { round: "S16", slot: 4, side: "team2_id" },
  "R32|9": { round: "S16", slot: 6, side: "team1_id" },
  "R32|10": { round: "S16", slot: 6, side: "team2_id" },
  "R32|11": { round: "S16", slot: 5, side: "team1_id" },
  "R32|12": { round: "S16", slot: 5, side: "team2_id" },
  "R32|13": { round: "S16", slot: 8, side: "team1_id" },
  "R32|14": { round: "S16", slot: 7, side: "team1_id" },
  "R32|15": { round: "S16", slot: 8, side: "team2_id" },
  "R32|16": { round: "S16", slot: 7, side: "team2_id" },
  "S16|1": { round: "E8", slot: 1, side: "team1_id" },
  "S16|2": { round: "E8", slot: 1, side: "team2_id" },
  "S16|3": { round: "E8", slot: 3, side: "team1_id" },
  "S16|4": { round: "E8", slot: 3, side: "team2_id" },
  "S16|5": { round: "E8", slot: 2, side: "team1_id" },
  "S16|6": { round: "E8", slot: 2, side: "team2_id" },
  "S16|7": { round: "E8", slot: 4, side: "team1_id" },
  "S16|8": { round: "E8", slot: 4, side: "team2_id" },
  "E8|1": { round: "F4", slot: 1, side: "team1_id" },
  "E8|2": { round: "F4", slot: 1, side: "team2_id" },
  "E8|3": { round: "F4", slot: 2, side: "team1_id" },
  "E8|4": { round: "F4", slot: 2, side: "team2_id" },
};

function norm(v) { return String(v ?? "").trim().toLowerCase(); }

function gameKey(slug, round, region, slot) {
  const prefix = `${norm(slug) || "march-madness"}|`;
  if (["R64", "R32", "S16", "E8"].includes(round)) return `${prefix}${round}|${norm(region)}|${slot}`;
  return `${prefix}${round}|${slot}`;
}

function nextTarget(game) {
  const round = String(game.round ?? "").toUpperCase();
  const slot = Number(game.slot);
  if (!Number.isFinite(slot) || slot < 1) return null;

  if (game.competition_slug === "world-cup") {
    const mapped = WC_NEXT[`${round}|${Math.trunc(slot)}`];
    if (mapped) return { ...mapped, region: null };
  }

  if (round === "R64" || round === "R32" || round === "S16") {
    const nextRound = round === "R64" ? "R32" : round === "R32" ? "S16" : "E8";
    return { round: nextRound, region: game.region ?? null, slot: Math.ceil(slot / 2), side: slot % 2 === 1 ? "team1_id" : "team2_id" };
  }
  if (round === "E8") {
    const r = norm(game.region);
    if (r === "east")    return { round: "F4", region: null, slot: 1, side: "team1_id" };
    if (r === "south")   return { round: "F4", region: null, slot: 1, side: "team2_id" };
    if (r === "west")    return { round: "F4", region: null, slot: 2, side: "team1_id" };
    if (r === "midwest") return { round: "F4", region: null, slot: 2, side: "team2_id" };
    return { round: "F4", region: null, slot: Math.ceil(slot / 2), side: slot % 2 === 1 ? "team1_id" : "team2_id" };
  }
  if (round === "F4") {
    if (slot === 1) return { round: "CHIP", region: null, slot: 1, side: "team1_id" };
    if (slot === 2) return { round: "CHIP", region: null, slot: 1, side: "team2_id" };
  }
  return null;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function ok(msg)   { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.log(`  ✗ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function section(title) { console.log(`\n--- ${title} ---`); }

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  console.log("=== World Cup Bracket & Scoring Audit ===");
  console.log(`    ${new Date().toISOString()}\n`);

  // ---- Fetch World Cup data only ----
  const [gamesRes, teamsRes, poolsRes] = await Promise.all([
    db.from("games").select("id,round,region,slot,team1_id,team2_id,winner_team_id,competition_slug").eq("competition_slug", "world-cup"),
    db.from("teams").select("id,name,seed,seed_in_region,region,cost,competition_slug").eq("competition_slug", "world-cup"),
    db.from("pools").select("id,name,competition_slug").eq("competition_slug", "world-cup").order("name"),
  ]);

  if (gamesRes.error) throw gamesRes.error;
  if (teamsRes.error) throw teamsRes.error;
  if (poolsRes.error) throw poolsRes.error;

  const games = (gamesRes.data ?? []).map((g) => ({ ...g, id: String(g.id) }));
  const teams = (teamsRes.data ?? []).map((t) => ({ ...t, id: String(t.id) }));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamName = (id) => teamById.get(id)?.name ?? id ?? "(null)";

  console.log(`  Loaded ${games.length} WC games, ${teams.length} WC teams, ${poolsRes.data?.length ?? 0} WC pool(s)`);

  // ---- 1. Build lookup map for next-round check ----
  section("Bracket Advancement Check");
  const byKey = new Map();
  for (const g of games) {
    const round = String(g.round ?? "").toUpperCase();
    const slot = Number(g.slot);
    if (!Number.isFinite(slot) || slot < 1 || !round) continue;
    byKey.set(gameKey(g.competition_slug, round, g.region ?? null, Math.trunc(slot)), g);
  }

  const ROUND_ORDER = { GROUP: 0, R64: 1, R32: 2, S16: 3, E8: 4, F4: 5, CHIP: 6 };
  const sorted = [...games].sort((a, b) => {
    const ao = ROUND_ORDER[String(a.round ?? "").toUpperCase()] ?? 99;
    const bo = ROUND_ORDER[String(b.round ?? "").toUpperCase()] ?? 99;
    return ao !== bo ? ao - bo : Number(a.slot ?? 0) - Number(b.slot ?? 0);
  });

  let bracketIssues = 0;
  for (const src of sorted) {
    if (!src.winner_team_id) continue;
    const ref = nextTarget(src);
    if (!ref) continue;
    const target = byKey.get(gameKey("world-cup", ref.round, ref.region ?? null, ref.slot));
    if (!target) {
      warn(`No target game found: ${src.round} slot ${src.slot} → ${ref.round} slot ${ref.slot}`);
      continue;
    }
    const expected = src.winner_team_id;
    const actual = target[ref.side];
    if (expected !== actual) {
      bracketIssues++;
      fail(`${src.round} slot ${src.slot}: winner "${teamName(expected)}" should be in ${ref.round} slot ${ref.slot} (${ref.side}), but found "${teamName(actual)}"`);
    }
  }
  if (bracketIssues === 0) ok("All bracket slots correctly populated");
  else console.log(`\n  Total: ${bracketIssues} advancement issue(s)`);

  // ---- 2. Stale winner check ----
  section("Stale Winner Check");
  let stale = 0;
  for (const g of games) {
    if (!g.winner_team_id) continue;
    if (g.winner_team_id !== g.team1_id && g.winner_team_id !== g.team2_id) {
      stale++;
      fail(`${g.round} slot ${g.slot}: winner "${teamName(g.winner_team_id)}" not in [${teamName(g.team1_id)}, ${teamName(g.team2_id)}]`);
    }
  }
  if (stale === 0) ok("No stale winner IDs found");

  // ---- 3. Pool leaderboard spot-check ----
  section("Pool Leaderboard Spot-Check");

  const pools = poolsRes.data ?? [];
  if (pools.length === 0) {
    console.log("  No pools found");
  }

  // All fetched pools are already filtered to world-cup by the initial query
  const seedById = new Map(teams.map((t) => [t.id, t.seed_in_region ?? t.seed ?? null]));
  const costById = new Map(teams.map((t) => [t.id, t.cost ?? null]));
  const teamScores = scoreTeamWinsWC(games, costById);

  let totalOrphans = 0;
  for (const pool of pools) {
    const lbRes = await db.from("pool_leaderboard").select("entry_id,display_name").eq("pool_id", pool.id);
    if (lbRes.error) { warn(`Leaderboard error for "${pool.name}": ${lbRes.error.message}`); continue; }

    const entryIds = (lbRes.data ?? []).map((r) => r.entry_id);
    if (entryIds.length === 0) { console.log(`  Pool "${pool.name}": no entries`); continue; }

    const labelById = new Map((lbRes.data ?? []).map((r) => [r.entry_id, r.display_name?.trim() || r.entry_id.slice(0, 8)]));

    const epRes = await db.from("entry_picks").select("entry_id,team_id").in("entry_id", entryIds);
    if (epRes.error) { warn(`Picks error for "${pool.name}": ${epRes.error.message}`); continue; }

    const competitionGames = games; // already world-cup only

    const picksByEntry = new Map(entryIds.map((id) => [id, []]));
    for (const row of epRes.data ?? []) {
      const arr = picksByEntry.get(row.entry_id) ?? [];
      arr.push(row.team_id);
      picksByEntry.set(row.entry_id, arr);
    }

    const entryScores = computeEntryScores(competitionGames, teamScores, seedById, picksByEntry, true);

    const ranked = [...entryIds]
      .map((id) => ({ id, score: entryScores.get(id) ?? 0, label: labelById.get(id) ?? id.slice(0, 8) }))
      .sort((a, b) => b.score - a.score);

    console.log(`\n  Pool: "${pool.name}" — ${entryIds.length} entr${entryIds.length === 1 ? "y" : "ies"}`);
    ranked.slice(0, 10).forEach((e, i) => {
      console.log(`    ${i + 1}.  ${String(e.score).padStart(5)}  ${e.label}`);
    });
    if (ranked.length > 10) console.log(`    ... and ${ranked.length - 10} more`);

    // Orphan picks: team IDs in picks that don't appear in any WC game slot
    const gameTeamIds = new Set();
    for (const g of competitionGames) {
      if (g.team1_id) gameTeamIds.add(g.team1_id);
      if (g.team2_id) gameTeamIds.add(g.team2_id);
    }
    const allPickIds = new Set((epRes.data ?? []).map((r) => r.team_id).filter(Boolean));
    const orphans = [...allPickIds].filter((id) => !gameTeamIds.has(id));
    if (orphans.length > 0) {
      totalOrphans += orphans.length;
      warn(`${orphans.length} team ID(s) in picks not found in any world-cup game:`);
      orphans.forEach((id) => console.log(`    - "${teamName(id)}" (${id})`));
    }
  }

  section("Summary");
  const issues = bracketIssues + stale + totalOrphans;
  if (issues === 0) {
    ok("No issues found");
  } else {
    console.log(`  ${bracketIssues} bracket mismatch(es), ${stale} stale winner(s), ${totalOrphans} orphan pick(s)`);
  }
  console.log("\n=== Audit complete ===");
}

main().catch((err) => {
  console.error("\nAudit failed:", err);
  process.exit(1);
});
