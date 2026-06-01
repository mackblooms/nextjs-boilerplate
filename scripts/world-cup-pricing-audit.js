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
  const expectedGroupWins = groupPoints / 3;
  const underdogBonus = cost < config.underdogBonus.maximumCostExclusive
    ? config.underdogBonus.groupWin * expectedGroupWins +
      config.underdogBonus.groupQualification * r32
    : 0;
  const valueRunBonus = cost <= config.valueRunBonus.maximumCostInclusive
    ? config.valueRunBonus.roundOf16 * r16 +
      config.valueRunBonus.quarterfinal * qf +
      config.valueRunBonus.semifinal * sf +
      config.valueRunBonus.final * final +
      config.valueRunBonus.champion * champion
    : 0;
  const bonus = underdogBonus + valueRunBonus;

  return { base, bonus, total: base + bonus };
}

function normalizePrices(rows) {
  const scores = rows.map((row) => scoreProjection(row.raw, config.priceRange.maximum).base);
  const minimum = Math.min(...scores);
  const maximum = Math.max(...scores);
  return new Map(
    rows.map((row, index) => [
      row.name,
      Math.round(
        config.priceRange.minimum +
          (config.priceRange.maximum - config.priceRange.minimum) *
            Math.pow((scores[index] - minimum) / (maximum - minimum), config.priceRange.curveExponent),
      ),
    ]),
  );
}

function pad(value, length) {
  return String(value).padEnd(length);
}

const rows = config.teams.map((raw) => ({ raw, name: raw[0], group: raw[1] }));
const prices = normalizePrices(rows);
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
  console.log(`Prices: normalized base-score EV with ${config.priceRange.curveExponent} curve exponent; bonus EV is reported separately`);
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
  const byBudget = Array(budget + 1).fill(null);
  byBudget[0] = { expectedValue: 0, teams: [] };
  for (const row of results) {
    for (let current = budget; current >= row.cost; current -= 1) {
      const prior = byBudget[current - row.cost];
      if (!prior) continue;
      const expectedValue = prior.expectedValue + row.total;
      if (!byBudget[current] || expectedValue > byBudget[current].expectedValue) {
        byBudget[current] = { expectedValue, teams: [...prior.teams, row.name] };
      }
    }
  }
  return byBudget.reduce(
    (best, row, totalCost) =>
      row && (!best || row.expectedValue > best.expectedValue) ? { ...row, totalCost } : best,
    null,
  );
}

if (require.main === module) {
  const portfolio = bestPortfolio();
  console.log("");
  console.log(`Best projected 100-point portfolio: ${portfolio.teams.join(", ")}`);
  console.log(`Portfolio cost: ${portfolio.totalCost}; projected EV: ${portfolio.expectedValue.toFixed(1)}`);
}

module.exports = { bestPortfolio, results };
