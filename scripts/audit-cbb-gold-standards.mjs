import fs from "node:fs";
import path from "node:path";

const projectionPath = path.resolve("data", "cbb", "player-projections.json");
const configPath = path.resolve("data", "cbb", "gold-standard-rows.json");

const projectionData = JSON.parse(fs.readFileSync(projectionPath, "utf8"));
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const MANUAL_FIELDS = [
  "projectedRole",
  "opportunityChange",
  "offensiveBurden",
  "opportunityScore",
  "entryTalentGrade",
  "nbaProjectionScore",
  "upsideToolsScore",
  "talentScore",
  "developmentScore",
  "projectionScore",
  "projectedBbpr",
  "confidenceScore",
];

function avg(values) {
  const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length).toFixed(2));
}

function min(values) {
  const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Number(Math.min(...numeric).toFixed(2));
}

function max(values) {
  const numeric = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return Number(Math.max(...numeric).toFixed(2));
}

function bySourceRow(players) {
  return new Map(players.map((player) => [player.sourceRow, player]));
}

function summarizeGroup(label, rows, playerByRow) {
  const players = [];
  const missingRows = [];

  for (const row of rows) {
    const player = playerByRow.get(row);
    if (player) {
      players.push(player);
    } else {
      missingRows.push(row);
    }
  }

  const fieldSummary = {};
  for (const field of MANUAL_FIELDS) {
    const values = players.map((player) => player[field]);
    fieldSummary[field] = {
      avg: avg(values),
      min: min(values),
      max: max(values),
    };
  }

  const starterBreakdown = {};
  for (const player of players) {
    const key = player.projectedStarter ?? "blank";
    starterBreakdown[key] = (starterBreakdown[key] ?? 0) + 1;
  }

  const needsReview = players.filter((player) => player.needsReview).length;
  const completed = players.length - needsReview;

  return {
    label,
    rows,
    missingRows,
    count: players.length,
    completed,
    needsReview,
    starterBreakdown,
    fieldSummary,
    players: players.map((player) => ({
      row: player.sourceRow,
      player: player.player,
      team: player.currentTeam,
      previousTeam: player.previousTeam,
      type: player.playerType,
      projectedBbpr: player.projectedBbpr,
      projectionScore: player.projectionScore,
      opportunityScore: player.opportunityScore,
      talentScore: player.talentScore,
      confidenceGrade: player.confidenceGrade,
      needsReview: player.needsReview,
    })),
  };
}

const playerByRow = bySourceRow(projectionData.players);
const summaries = Object.entries(config.groups).map(([label, rows]) =>
  summarizeGroup(label, rows, playerByRow)
);

const allConfiguredRows = new Set(Object.values(config.groups).flat());
const allGoldPlayers = projectionData.players.filter((player) => allConfiguredRows.has(player.sourceRow));

console.log(`CBB gold standard audit`);
console.log(`Source: ${projectionData.sourceWorkbook}`);
console.log(`Generated: ${projectionData.generatedAt}`);
console.log(`Configured rows: ${allConfiguredRows.size}`);
console.log(`Matched rows: ${allGoldPlayers.length}`);
console.log("");

for (const summary of summaries) {
  console.log(`## ${summary.label}`);
  console.log(
    `rows=${summary.rows.length} matched=${summary.count} completed=${summary.completed} needsReview=${summary.needsReview}`
  );
  if (summary.missingRows.length > 0) {
    console.log(`missing rows: ${summary.missingRows.join(", ")}`);
  }
  console.log(`starter breakdown: ${JSON.stringify(summary.starterBreakdown)}`);
  console.log(
    `avg scores: projectedBbpr=${summary.fieldSummary.projectedBbpr.avg ?? "n/a"}, projection=${summary.fieldSummary.projectionScore.avg ?? "n/a"}, opportunity=${summary.fieldSummary.opportunityScore.avg ?? "n/a"}, talent=${summary.fieldSummary.talentScore.avg ?? "n/a"}, confidence=${summary.fieldSummary.confidenceScore.avg ?? "n/a"}`
  );
  console.table(summary.players);
}

const outputPath = path.resolve("data", "cbb", "gold-standard-audit.json");
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceWorkbook: projectionData.sourceWorkbook,
      configuredRows: allConfiguredRows.size,
      matchedRows: allGoldPlayers.length,
      scoringContext: config.scoringContext,
      summaries,
    },
    null,
    2
  )}\n`
);

console.log(`Wrote ${outputPath}`);
