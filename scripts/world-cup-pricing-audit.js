#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const config = require("./world-cup-pricing-config.json");

function pct(value) {
  return Number(value) / 100;
}

function valueUnit(cost) {
  return Math.max(0, 10 - cost);
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
  const unit = valueUnit(cost);
  const bonus =
    unit *
    (config.valueBonusWeights.groupQualification * r32 +
      config.valueBonusWeights.roundOf16 * r16 +
      config.valueBonusWeights.quarterfinal * qf +
      config.valueBonusWeights.semifinal * sf +
      config.valueBonusWeights.final * final +
      config.valueBonusWeights.champion * champion);

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
          ((config.priceRange.maximum - config.priceRange.minimum) * (scores[index] - minimum)) /
            (maximum - minimum),
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
  console.log("Prices: normalized base-score EV only; bonus EV is reported separately");
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

module.exports = { results };
