#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const config = require("./world-cup-pricing-config.json");

function pct(value) {
  return Number(value) / 100;
}

function scoreProjection(team, cost) {
  const [, , r32Raw, r16Raw, qfRaw, sfRaw, finalRaw, championRaw] = team;
  const [r32, r16, qf, sf, final, champion] =
    [r32Raw, r16Raw, qfRaw, sfRaw, finalRaw, championRaw].map(pct);
  const groupPoints =
    config.groupPointsApproximation.floor +
    config.groupPointsApproximation.qualificationWeight * r32;
  const base =
    groupPoints +
    config.basePoints.groupQualification * r32 +
    config.basePoints.roundOf32Win * r16 +
    config.basePoints.roundOf16Win * qf +
    config.basePoints.quarterfinalWin * sf +
    config.basePoints.semifinalWin * final +
    config.basePoints.championshipWin * champion;
  const breakoutBonus = cost <= config.breakoutBonus.maximumCostInclusive
    ? config.breakoutBonus.groupQualification * r32
    : 0;
  const valueRunBonus = cost < config.valueRunBonus.maximumCostExclusive
    ? config.valueRunBonus.roundOf16 * r16 +
      config.valueRunBonus.quarterfinal * qf +
      config.valueRunBonus.semifinal * sf +
      config.valueRunBonus.final * final +
      config.valueRunBonus.champion * champion
    : 0;
  const bonus = breakoutBonus + valueRunBonus;

  return { base, bonus, total: base + bonus };
}

function tierPrices(rows) {
  const prices = new Map();
  for (const [, cost, teams] of config.tiers) {
    for (const team of teams) {
      if (prices.has(team)) throw new Error(`Duplicate tier assignment for ${team}.`);
      prices.set(team, cost);
    }
  }
  for (const row of rows) {
    if (!prices.has(row.name)) throw new Error(`Missing tier assignment for ${row.name}.`);
  }
  if (prices.size !== rows.length) throw new Error("Tier board contains a team without pricing inputs.");
  return prices;
}

function pad(value, length) {
  return String(value).padEnd(length);
}

const rows = config.teams.map((raw) => ({ raw, name: raw[0], group: raw[1] }));
const prices = tierPrices(rows);
const results = rows
  .map((row) => {
    const cost = prices.get(row.name);
    return { ...row, cost, ...scoreProjection(row.raw, cost) };
  })
  .sort((a, b) => b.cost - a.cost || b.total - a.total || a.name.localeCompare(b.name));

function printAudit() {
  console.log("World Cup pricing audit");
  console.log("Model probabilities: Goldman Sachs, May 29, 2026");
  console.log("Group points approximation: floor + qualificationWeight * P(R32)");
  console.log("Prices: explicit Diamond-through-Moonshot tournament tiers; bonus EV is reported separately");
  console.log("");
  console.log(`${pad("Team", 25)} ${pad("Grp", 4)} ${pad("Cost", 5)} ${pad("Base EV", 8)} ${pad("Bonus EV", 9)} Total EV`);
  console.log("-".repeat(69));
  for (const row of results) {
    console.log(
      `${pad(row.name, 25)} ${pad(row.group, 4)} ${pad(row.cost, 5)} ${pad(row.base.toFixed(1), 8)} ${pad(row.bonus.toFixed(1), 9)} ${row.total.toFixed(1)}`,
    );
  }
}

if (require.main === module) printAudit();

function bestPortfolio(budget = 100) {
  const maximumEliteTeams = config.draftCaps.maximumEliteTeams;
  const eliteMinimumCost = config.draftCaps.eliteMinimumCost;
  const byBudget = Array.from({ length: budget + 1 }, () => Array(maximumEliteTeams + 1).fill(null));
  byBudget[0][0] = { expectedValue: 0, teams: [] };
  for (const row of results) {
    const eliteIncrement = row.cost >= eliteMinimumCost ? 1 : 0;
    for (let current = budget; current >= row.cost; current -= 1) {
      for (let eliteCount = maximumEliteTeams; eliteCount >= eliteIncrement; eliteCount -= 1) {
        const prior = byBudget[current - row.cost][eliteCount - eliteIncrement];
        if (!prior) continue;
        const expectedValue = prior.expectedValue + row.total;
        if (!byBudget[current][eliteCount] || expectedValue > byBudget[current][eliteCount].expectedValue) {
          byBudget[current][eliteCount] = { expectedValue, teams: [...prior.teams, row.name] };
        }
      }
    }
  }
  return byBudget.flatMap((rows, totalCost) => rows.map((row, eliteCount) => row && ({ ...row, totalCost, eliteCount })))
    .filter(Boolean)
    .reduce((best, row) => (!best || row.expectedValue > best.expectedValue ? row : best), null);
}

if (require.main === module) {
  const portfolio = bestPortfolio();
  console.log("");
  console.log(`Best projected 100-point portfolio: ${portfolio.teams.join(", ")}`);
  console.log(`Portfolio cost: ${portfolio.totalCost}; elite teams: ${portfolio.eliteCount}; projected EV: ${portfolio.expectedValue.toFixed(1)}`);
}

module.exports = { bestPortfolio, results };
