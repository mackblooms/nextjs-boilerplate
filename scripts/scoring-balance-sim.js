#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_CONFIG_PATH = path.join(__dirname, "scoring-balance-config.json");
const SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const DEFAULT_ROUNDS = ["R64", "R32", "S16", "E8", "F4", "CHIP"];
const DEFAULT_PORTFOLIO = [14, 15, 16];

function readJson(filePath) {
  const fullPath = path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(fullPath, "utf8");
  return { fullPath, data: JSON.parse(raw) };
}

function asSeedMap(obj, fallback = 0) {
  const out = {};
  for (const seed of SEEDS) {
    const value = obj?.[String(seed)] ?? obj?.[seed];
    out[seed] = Number.isFinite(Number(value)) ? Number(value) : fallback;
  }
  return out;
}

function asRoundMap(obj, rounds) {
  const out = {};
  for (const round of rounds) {
    const value = obj?.[round];
    out[round] = Number.isFinite(Number(value)) ? Number(value) : 0;
  }
  return out;
}

function asSeedRoundMap(obj, rounds) {
  const out = {};
  for (const seed of SEEDS) {
    out[seed] = asRoundMap(obj?.[String(seed)] ?? obj?.[seed], rounds);
  }
  return out;
}

function normalizeConfig(input) {
  const rounds = Array.isArray(input?.rounds) && input.rounds.length > 0
    ? input.rounds.map((r) => String(r))
    : DEFAULT_ROUNDS;

  return {
    budget: Number(input?.budget ?? 100),
    teamsPerSeed: Number(input?.teamsPerSeed ?? 4),
    rounds,
    basePointsByRound: asRoundMap(input?.basePointsByRound ?? {}, rounds),
    costBySeed: asSeedMap(input?.costBySeed ?? {}, 0),
    upsetBonusPerSeedDiff: Number(input?.upsetBonusPerSeedDiff ?? 0),
    seedMultiplierStep: Number(input?.seedMultiplierStep ?? 0),
    historicBonusBySeed: asSeedMap(input?.historicBonusBySeed ?? {}, 0),
    r64OpponentBySeed: asSeedMap(input?.r64OpponentBySeed ?? {}, 0),
    historicalWinProbBySeed: asSeedRoundMap(input?.historicalWinProbBySeed ?? {}, rounds),
  };
}

function seedMultiplier(seed, step) {
  if (!seed || seed < 1 || seed > 16) return 1;
  return 1 + (seed - 1) * step;
}

function winScore({ seed, round, opponentSeed, includeHistoric, cfg }) {
  const base = cfg.basePointsByRound[round] ?? 0;
  const scaledBase = base * seedMultiplier(seed, cfg.seedMultiplierStep);
  const upsetBonus = Math.max(0, cfg.upsetBonusPerSeedDiff * (seed - opponentSeed));
  const historicBonus = includeHistoric ? (cfg.historicBonusBySeed[seed] ?? 0) : 0;
  return Math.round(scaledBase + upsetBonus + historicBonus);
}

function calcRows(cfg) {
  return SEEDS.map((seed) => {
    const cost = cfg.costBySeed[seed];
    const opponentSeed = cfg.r64OpponentBySeed[seed];
    const pR64 = cfg.historicalWinProbBySeed[seed]?.R64 ?? 0;

    const r64WinPoints = winScore({
      seed,
      round: "R64",
      opponentSeed,
      includeHistoric: true,
      cfg,
    });

    let evBaseOnly = 0;
    for (const round of cfg.rounds) {
      const pWinRound = cfg.historicalWinProbBySeed[seed]?.[round] ?? 0;
      const baseOnly = cfg.basePointsByRound[round] * seedMultiplier(seed, cfg.seedMultiplierStep);
      evBaseOnly += pWinRound * baseOnly;
    }

    const r64BonusOnly = Math.max(0, cfg.upsetBonusPerSeedDiff * (seed - opponentSeed)) + (cfg.historicBonusBySeed[seed] ?? 0);
    const evWithR64Layer = evBaseOnly + pR64 * r64BonusOnly;

    const safeCost = cost > 0 ? cost : NaN;
    return {
      seed,
      cost,
      r64WinPoints,
      r64WinPerCost: r64WinPoints / safeCost,
      evBaseOnly,
      evPerCostBaseOnly: evBaseOnly / safeCost,
      evWithR64Layer,
      evPerCostWithR64Layer: evWithR64Layer / safeCost,
      pR64,
    };
  });
}

function portfolioSummary(cfg, rows, seeds = DEFAULT_PORTFOLIO) {
  const teamsPerSeed = Number.isFinite(cfg.teamsPerSeed) && cfg.teamsPerSeed > 0 ? cfg.teamsPerSeed : 4;
  let totalCost = 0;
  let totalEV = 0;
  let totalEVR64Only = 0;
  const lines = [];

  for (const seed of seeds) {
    const row = rows.find((r) => r.seed === seed);
    if (!row) continue;
    const count = teamsPerSeed;
    totalCost += row.cost * count;
    totalEV += row.evWithR64Layer * count;
    totalEVR64Only += row.r64WinPoints * row.pR64 * count;
    lines.push({
      seed,
      count,
      cost: row.cost * count,
      evWithR64Layer: row.evWithR64Layer * count,
      evFromR64Only: row.r64WinPoints * row.pR64 * count,
    });
  }

  return {
    seeds,
    teamsPerSeed,
    lines,
    totalCost,
    budgetLeft: cfg.budget - totalCost,
    totalEV,
    totalEVPerCost: totalEV / (totalCost || NaN),
    totalEVR64Only,
  };
}

function formatNum(n, digits = 2) {
  return Number.isFinite(n) ? n.toFixed(digits) : "n/a";
}

function printTable(rows, headers, pick) {
  const strRows = rows.map((row) => headers.map((h) => String(pick(row, h))));
  const widths = headers.map((h, i) => Math.max(h.length, ...strRows.map((r) => r[i].length)));
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join("  ");
  const sepLine = widths.map((w) => "-".repeat(w)).join("  ");
  console.log(headerLine);
  console.log(sepLine);
  for (const row of strRows) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join("  "));
  }
}

function main() {
  const configPath = process.argv[2] || DEFAULT_CONFIG_PATH;
  const { fullPath, data } = readJson(configPath);
  const cfg = normalizeConfig(data);
  const rows = calcRows(cfg);
  const portfolio = portfolioSummary(cfg, rows);

  console.log("");
  console.log(`Scoring Balance Simulator`);
  console.log(`Config: ${fullPath}`);
  console.log(`Budget: ${cfg.budget}`);
  console.log(`Upset bonus coefficient: ${cfg.upsetBonusPerSeedDiff}`);
  console.log(`Seed multiplier step: ${cfg.seedMultiplierStep}`);
  console.log("");

  printTable(
    rows,
    [
      "Seed",
      "Cost",
      "R64WinPts",
      "R64Win/Cost",
      "EV(base)",
      "EV/Cost(base)",
      "EV(+R64bonus)",
      "EV/Cost(+R64bonus)",
    ],
    (row, header) => {
      switch (header) {
        case "Seed":
          return row.seed;
        case "Cost":
          return row.cost;
        case "R64WinPts":
          return row.r64WinPoints;
        case "R64Win/Cost":
          return formatNum(row.r64WinPerCost);
        case "EV(base)":
          return formatNum(row.evBaseOnly, 1);
        case "EV/Cost(base)":
          return formatNum(row.evPerCostBaseOnly);
        case "EV(+R64bonus)":
          return formatNum(row.evWithR64Layer, 1);
        case "EV/Cost(+R64bonus)":
          return formatNum(row.evPerCostWithR64Layer);
        default:
          return "";
      }
    },
  );

  const topValue = [...rows]
    .sort((a, b) => b.evPerCostWithR64Layer - a.evPerCostWithR64Layer)
    .slice(0, 8);

  console.log("");
  console.log("Top 8 seeds by EV/Cost (+R64 bonus layer)");
  printTable(topValue, ["Seed", "Cost", "EV/Cost(+R64bonus)"], (row, header) => {
    switch (header) {
      case "Seed":
        return row.seed;
      case "Cost":
        return row.cost;
      case "EV/Cost(+R64bonus)":
        return formatNum(row.evPerCostWithR64Layer);
      default:
        return "";
    }
  });

  console.log("");
  console.log(`Portfolio check: ${portfolio.seeds.join("/")}-seed package (${portfolio.teamsPerSeed} teams each)`);
  printTable(portfolio.lines, ["Seed", "Count", "Cost", "EV(+R64bonus)", "EV(from R64 only)"], (row, header) => {
    switch (header) {
      case "Seed":
        return row.seed;
      case "Count":
        return row.count;
      case "Cost":
        return formatNum(row.cost, 0);
      case "EV(+R64bonus)":
        return formatNum(row.evWithR64Layer, 1);
      case "EV(from R64 only)":
        return formatNum(row.evFromR64Only, 1);
      default:
        return "";
    }
  });
  console.log(`Total package cost: ${formatNum(portfolio.totalCost, 0)} / ${cfg.budget}`);
  console.log(`Budget left: ${formatNum(portfolio.budgetLeft, 0)}`);
  console.log(`Package EV (+R64 bonus layer): ${formatNum(portfolio.totalEV, 1)}`);
  console.log(`Package EV per cost: ${formatNum(portfolio.totalEVPerCost)}`);
  console.log(`Package EV from R64 outcomes only: ${formatNum(portfolio.totalEVR64Only, 1)}`);
  console.log("");
}

main();
