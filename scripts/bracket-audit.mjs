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
 *  5. Entry stability   — entry picks are present and not silently replaced by saved drafts
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyWorldCupManualResultOverrides } from "../lib/worldCupManualResults.js";

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

const WC_WIN_PTS = { R32: 18, S16: 30, E8: 48, F4: 72, CHIP: 100 };
const WC_LONGSHOT_BONUS = { GROUP_ADVANCE: 25, R32: 50, S16: 75, E8: 100, F4: 150, CHIP: 200 };
const WC_VALUE_BONUS = { GROUP_ADVANCE: 5, R32: 10, S16: 20, E8: 40, F4: 80, CHIP: 160 };

function isFinal(status) {
  return String(status ?? "").trim().toLowerCase().startsWith("final");
}

function wcValuePickBonus(cost, round) {
  if (cost == null) return 0;
  if (cost <= 5) return WC_LONGSHOT_BONUS[round] ?? 0;
  if (cost <= 10) return WC_VALUE_BONUS[round] ?? 0;
  return 0;
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

function computeEntryScores(teamScores, picksByEntry) {
  const result = new Map();
  for (const [entryId, rawPicks] of picksByEntry) {
    const picks = [...new Set(rawPicks.filter(Boolean))];
    result.set(entryId, picks.reduce((s, id) => s + (teamScores.get(id) ?? 0), 0));
  }
  return result;
}

function setKey(values) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort().join("|");
}

// --------------------------------------------------------------------------
// Inlined bracket propagation logic (mirrors set-game-winner/route.ts)
// --------------------------------------------------------------------------

const WC_NEXT = {
  "R32|1": { round: "S16", slot: 1, side: "team1_id" },
  "R32|2": { round: "S16", slot: 1, side: "team2_id" },
  "R32|3": { round: "S16", slot: 2, side: "team1_id" },
  "R32|4": { round: "S16", slot: 2, side: "team2_id" },
  "R32|5": { round: "S16", slot: 3, side: "team1_id" },
  "R32|6": { round: "S16", slot: 3, side: "team2_id" },
  "R32|7": { round: "S16", slot: 4, side: "team1_id" },
  "R32|8": { round: "S16", slot: 4, side: "team2_id" },
  "R32|9": { round: "S16", slot: 5, side: "team1_id" },
  "R32|10": { round: "S16", slot: 5, side: "team2_id" },
  "R32|11": { round: "S16", slot: 6, side: "team1_id" },
  "R32|12": { round: "S16", slot: 6, side: "team2_id" },
  "R32|13": { round: "S16", slot: 7, side: "team1_id" },
  "R32|14": { round: "S16", slot: 7, side: "team2_id" },
  "R32|15": { round: "S16", slot: 8, side: "team1_id" },
  "R32|16": { round: "S16", slot: 8, side: "team2_id" },
  "S16|1": { round: "E8", slot: 1, side: "team1_id" },
  "S16|2": { round: "E8", slot: 1, side: "team2_id" },
  "S16|3": { round: "E8", slot: 2, side: "team1_id" },
  "S16|4": { round: "E8", slot: 2, side: "team2_id" },
  "S16|5": { round: "E8", slot: 3, side: "team1_id" },
  "S16|6": { round: "E8", slot: 3, side: "team2_id" },
  "S16|7": { round: "E8", slot: 4, side: "team1_id" },
  "S16|8": { round: "E8", slot: 4, side: "team2_id" },
  "E8|1": { round: "F4", slot: 1, side: "team1_id" },
  "E8|2": { round: "F4", slot: 1, side: "team2_id" },
  "E8|3": { round: "F4", slot: 2, side: "team1_id" },
  "E8|4": { round: "F4", slot: 2, side: "team2_id" },
};

const WC_REFERENCE_R32_MATCHUPS = [
  ["Brazil", "Japan"],
  ["Côte d'Ivoire", "Norway"],
  ["Mexico", "Ecuador"],
  ["England", "Congo DR"],
  ["Argentina", "Cabo Verde"],
  ["Australia", "Egypt"],
  ["Switzerland", "Algeria"],
  ["Colombia", "Ghana"],
  ["Senegal", "Belgium"],
  ["USA", "Bosnia and Herzegovina"],
  ["Spain", "Austria"],
  ["Portugal", "Croatia"],
  ["Netherlands", "Morocco"],
  ["Canada", "South Africa"],
  ["France", "Sweden"],
  ["Germany", "Paraguay"],
];

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
  let scoreColumnsAvailable = true;
  let gamesRes = await db
    .from("games")
    .select("id,round,region,slot,status,team1_id,team2_id,winner_team_id,team1_score,team2_score,competition_slug")
    .eq("competition_slug", "world-cup");
  if (gamesRes.error && /team[12]_score|does not exist/i.test(gamesRes.error.message ?? "")) {
    scoreColumnsAvailable = false;
    gamesRes = await db
      .from("games")
      .select("id,round,region,slot,status,team1_id,team2_id,winner_team_id,competition_slug")
      .eq("competition_slug", "world-cup");
  }

  const [teamsRes, poolsRes] = await Promise.all([
    db.from("teams").select("id,name,seed,seed_in_region,region,cost,competition_slug").eq("competition_slug", "world-cup"),
    db.from("pools").select("id,name,competition_slug").eq("competition_slug", "world-cup").order("name"),
  ]);

  if (gamesRes.error) throw gamesRes.error;
  if (teamsRes.error) throw teamsRes.error;
  if (poolsRes.error) throw poolsRes.error;

  const games = applyWorldCupManualResultOverrides(
    (gamesRes.data ?? []).map((g) => ({ ...g, id: String(g.id) })),
  );
  const teams = (teamsRes.data ?? []).map((t) => ({ ...t, id: String(t.id) }));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamName = (id) => teamById.get(id)?.name ?? id ?? "(null)";

  console.log(`  Loaded ${games.length} WC games, ${teams.length} WC teams, ${poolsRes.data?.length ?? 0} WC pool(s)`);
  if (!scoreColumnsAvailable) {
    warn("games.team1_score/team2_score are missing; World Cup draw scoring cannot be fully audited until db/migrations/20260606_world_cup_game_scores.sql is applied.");
  }

  // ---- 1. Build lookup map for next-round check ----
  section("R32 Reference Draw Check");
  let drawIssues = 0;
  for (const [index, [expectedTeam1, expectedTeam2]] of WC_REFERENCE_R32_MATCHUPS.entries()) {
    const slot = index + 1;
    const game = games.find((candidate) => candidate.round === "R32" && Number(candidate.slot) === slot);
    if (!game) {
      drawIssues++;
      fail(`R32 slot ${slot}: missing game`);
      continue;
    }
    const actualTeam1 = teamName(game.team1_id);
    const actualTeam2 = teamName(game.team2_id);
    if (actualTeam1 !== expectedTeam1 || actualTeam2 !== expectedTeam2) {
      drawIssues++;
      fail(
        `R32 slot ${slot}: expected ${expectedTeam1} vs ${expectedTeam2}, found ${actualTeam1} vs ${actualTeam2}`,
      );
    }
  }
  if (drawIssues === 0) ok("All R32 matchups match the World Cup reference draw");
  else console.log(`\n  Total: ${drawIssues} R32 draw issue(s)`);

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
  const costById = new Map(teams.map((t) => [t.id, t.cost ?? null]));
  const teamScores = scoreTeamWinsWC(games, costById);

  let totalOrphans = 0;
  let totalMissingPicks = 0;
  let totalLinkedDraftDrift = 0;
  for (const pool of pools) {
    const lbRes = await db.from("pool_leaderboard").select("entry_id,display_name").eq("pool_id", pool.id);
    if (lbRes.error) { warn(`Leaderboard error for "${pool.name}": ${lbRes.error.message}`); continue; }

    const entryIds = (lbRes.data ?? []).map((r) => r.entry_id);
    if (entryIds.length === 0) { console.log(`  Pool "${pool.name}": no entries`); continue; }

    const labelById = new Map((lbRes.data ?? []).map((r) => [r.entry_id, r.display_name?.trim() || r.entry_id.slice(0, 8)]));

    const [epRes, entriesRes] = await Promise.all([
      db.from("entry_picks").select("entry_id,team_id").in("entry_id", entryIds),
      db.from("entries").select("id,entry_name,saved_draft_id").in("id", entryIds),
    ]);
    if (epRes.error) { warn(`Picks error for "${pool.name}": ${epRes.error.message}`); continue; }

    const competitionGames = games; // already world-cup only

    const picksByEntry = new Map(entryIds.map((id) => [id, []]));
    for (const row of epRes.data ?? []) {
      const arr = picksByEntry.get(row.entry_id) ?? [];
      arr.push(row.team_id);
      picksByEntry.set(row.entry_id, arr);
    }

    const missingPicks = [...entryIds].filter((id) => (picksByEntry.get(id) ?? []).length === 0);
    if (missingPicks.length > 0) {
      totalMissingPicks += missingPicks.length;
      warn(`${missingPicks.length} entr${missingPicks.length === 1 ? "y has" : "ies have"} no persisted entry picks:`);
      missingPicks.forEach((id) => console.log(`    - ${labelById.get(id) ?? id.slice(0, 8)} (${id})`));
    }

    if (entriesRes.error) {
      warn(`Entry-link check skipped for "${pool.name}": ${entriesRes.error.message}`);
    } else {
      const linkedDraftIds = [
        ...new Set((entriesRes.data ?? []).map((row) => row.saved_draft_id).filter(Boolean).map(String)),
      ];
      if (linkedDraftIds.length > 0) {
        const draftPickRes = await db.from("saved_draft_picks").select("draft_id,team_id").in("draft_id", linkedDraftIds);
        if (draftPickRes.error) {
          warn(`Saved-draft drift check skipped for "${pool.name}": ${draftPickRes.error.message}`);
        } else {
          const draftPicksByDraft = new Map(linkedDraftIds.map((id) => [id, []]));
          for (const row of draftPickRes.data ?? []) {
            const arr = draftPicksByDraft.get(row.draft_id) ?? [];
            arr.push(row.team_id);
            draftPicksByDraft.set(row.draft_id, arr);
          }
          for (const entry of entriesRes.data ?? []) {
            if (!entry.saved_draft_id) continue;
            const entryKey = setKey(picksByEntry.get(entry.id) ?? []);
            const draftKey = setKey(draftPicksByDraft.get(entry.saved_draft_id) ?? []);
            if (entryKey !== draftKey) {
              totalLinkedDraftDrift++;
              warn(
                `Linked draft has changed since pool entry for ${labelById.get(entry.id) ?? entry.id.slice(0, 8)}; persisted entry picks remain the scoring source.`,
              );
            }
          }
        }
      }
    }

    const entryScores = computeEntryScores(teamScores, picksByEntry);

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
  const scoreSchemaIssues = scoreColumnsAvailable ? 0 : 1;
  const issues = drawIssues + bracketIssues + stale + totalOrphans + totalMissingPicks + scoreSchemaIssues;
  if (issues === 0) {
    ok("No issues found");
  } else {
    console.log(`  ${drawIssues} R32 draw issue(s), ${bracketIssues} bracket mismatch(es), ${stale} stale winner(s), ${totalOrphans} orphan pick(s), ${totalMissingPicks} missing-pick entr${totalMissingPicks === 1 ? "y" : "ies"}, ${scoreSchemaIssues} score-schema issue(s)`);
  }
  if (totalLinkedDraftDrift > 0) {
    console.log(`  Note: ${totalLinkedDraftDrift} linked saved draft(s) differ from their persisted pool entry picks.`);
  }
  console.log("\n=== Audit complete ===");
}

main().catch((err) => {
  console.error("\nAudit failed:", err);
  process.exit(1);
});
