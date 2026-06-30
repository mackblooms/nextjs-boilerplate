#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const COST_BY_TEAM = {
  Spain: 24,
  Argentina: 22,
  France: 22,
  Brazil: 20,
  England: 20,
  Germany: 20,
  Netherlands: 20,
  Portugal: 20,
  Belgium: 16,
  Canada: 16,
  Colombia: 16,
  Croatia: 16,
  Ecuador: 16,
  Mexico: 16,
  Norway: 16,
  Switzerland: 16,
  "Türkiye": 16,
  Australia: 10,
  Austria: 10,
  Czechia: 10,
  "IR Iran": 10,
  Japan: 10,
  "Korea Republic": 10,
  Morocco: 10,
  Paraguay: 10,
  Senegal: 10,
  Uruguay: 10,
  USA: 10,
  Algeria: 7,
  "Bosnia and Herzegovina": 7,
  "Côte d'Ivoire": 7,
  Egypt: 7,
  Jordan: 7,
  "New Zealand": 7,
  Panama: 7,
  Scotland: 7,
  Sweden: 7,
  Uzbekistan: 7,
  "Cabo Verde": 5,
  "Congo DR": 5,
  "Curaçao": 5,
  Haiti: 5,
  "Saudi Arabia": 5,
  "South Africa": 5,
  Tunisia: 5,
  Ghana: 3,
  Iraq: 3,
  Qatar: 3,
};

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

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const db = createClient(url, key);
  const { data: teams, error } = await db
    .from("teams")
    .select("id,name,cost")
    .eq("competition_slug", "world-cup");
  if (error) throw error;

  const seenNames = new Set((teams ?? []).map((team) => team.name));
  const missingNames = Object.keys(COST_BY_TEAM).filter((name) => !seenNames.has(name));
  if (missingNames.length > 0) {
    throw new Error(`Missing World Cup teams for cost repair: ${missingNames.join(", ")}`);
  }

  let updated = 0;
  for (const team of teams ?? []) {
    const targetCost = COST_BY_TEAM[team.name];
    if (targetCost == null) continue;
    if (team.cost === targetCost) continue;

    const { error: updateError } = await db
      .from("teams")
      .update({ cost: targetCost })
      .eq("id", team.id)
      .eq("competition_slug", "world-cup");
    if (updateError) throw updateError;
    updated++;
    console.log(`  ${team.name}: ${team.cost} -> ${targetCost}`);
  }

  console.log(`  Updated ${updated} World Cup team cost(s).`);
}

main().catch((error) => {
  console.error("\nCost repair failed:", error);
  process.exit(1);
});
