import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data", "cbb");
const now = "2026-08-03T12:00:00.000Z";

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function confidenceGrade(score) {
  if (score == null) return null;
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 75) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "B-";
  if (score >= 60) return "C+";
  if (score >= 55) return "C";
  if (score >= 50) return "C-";
  return "D";
}

function comparePlayers(left, right) {
  const scoreDiff = (numeric(right.projectedBbpr) ?? -1) - (numeric(left.projectedBbpr) ?? -1);
  if (scoreDiff !== 0) return scoreDiff;
  const confidenceDiff = (numeric(right.confidenceScore) ?? -1) - (numeric(left.confidenceScore) ?? -1);
  if (confidenceDiff !== 0) return confidenceDiff;
  return String(left.player).localeCompare(String(right.player));
}

const projectionsPath = path.join(dataDir, "player-projections.json");
const data = JSON.parse(fs.readFileSync(projectionsPath, "utf8"));
const wilkinson = data.players.find((player) => player.player === "Jeremiah Wilkinson");
if (!wilkinson) throw new Error("Jeremiah Wilkinson not found.");

wilkinson.historicalRating = 77.4;
wilkinson.projectedStarter = "Yes";
wilkinson.projectedRole = 93;
wilkinson.opportunityChange = 90;
wilkinson.offensiveBurden = 94;
wilkinson.opportunityScore = 92.3;
wilkinson.nbaProjectionScore = 84;
wilkinson.upsideToolsScore = 88;
wilkinson.talentScore = 85.6;
wilkinson.developmentScore = 40;
wilkinson.projectionScore = 79.495;
wilkinson.projectedBbpr = round(wilkinson.historicalRating * 0.75 + wilkinson.projectionScore * 0.25);
wilkinson.confidenceScore = 92;
wilkinson.confidenceGrade = confidenceGrade(wilkinson.confidenceScore);
wilkinson.needsReview = false;
wilkinson.projectionInputCompleteness = 100;
wilkinson.projectionNotes =
  "Replaces Uriah Tenette in the top-100 band after Arkansas added an SEC-proven scorer who led Georgia at 17.4 PPG; role input is kept below elite-primary territory because Arkansas still has multiple blue-chip usage threats.";
wilkinson.lastUpdated = now;

const ranked = data.players.filter((player) => numeric(player.projectedBbpr) != null).sort(comparePlayers);
for (const player of data.players) player.rank = null;
for (const [index, player] of ranked.entries()) player.rank = index + 1;
data.generatedAt = now;
fs.writeFileSync(projectionsPath, `${JSON.stringify(data, null, 2)}\n`);

const fields = [
  "projectedStarter",
  "projectedRole",
  "opportunityChange",
  "offensiveBurden",
  "opportunityScore",
  "nbaProjectionScore",
  "upsideToolsScore",
  "talentScore",
  "developmentScore",
  "projectionScore",
  "projectedBbpr",
  "confidenceScore",
  "confidenceGrade",
  "needsReview",
];

for (const file of ["transfer-research-batch-003.json", "transfer-projection-suggestions.json"]) {
  const filePath = path.join(dataDir, file);
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const collection = json.players ?? json.suggestions;
  const record = collection.find((player) => player.sourceRow === wilkinson.sourceRow);
  if (!record) throw new Error(`Jeremiah Wilkinson not found in ${file}.`);

  record.historicalRating = wilkinson.historicalRating;
  record.developmentScore = wilkinson.developmentScore;
  record.researchSummary = wilkinson.projectionNotes;
  record.suggested ??= {};
  for (const field of fields) record.suggested[field] = wilkinson[field];
  if (record.current) {
    record.current.historicalRating = wilkinson.historicalRating;
    record.current.developmentScore = wilkinson.developmentScore;
    record.current.projectedBbpr = wilkinson.projectedBbpr;
    record.current.needsReview = false;
    record.suggested.suggestionStatus = "researched";
  }
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

const reportPath = path.join(dataDir, "player-top100-replacements-2026-08-03.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const change = report.changes.find((item) => item.player === "Jeremiah Wilkinson");
if (change) {
  change.new = {
    rank: wilkinson.rank,
    historicalRating: wilkinson.historicalRating,
    projectedBbpr: wilkinson.projectedBbpr,
    projectedRole: wilkinson.projectedRole,
    opportunityChange: wilkinson.opportunityChange,
    offensiveBurden: wilkinson.offensiveBurden,
    opportunityScore: wilkinson.opportunityScore,
    entryTalentGrade: wilkinson.entryTalentGrade,
    nbaProjectionScore: wilkinson.nbaProjectionScore,
    upsideToolsScore: wilkinson.upsideToolsScore,
    talentScore: wilkinson.talentScore,
    projectionScore: wilkinson.projectionScore,
    confidenceScore: wilkinson.confidenceScore,
  };
}
const target = report.targetRanks.find((item) => item.player === "Jeremiah Wilkinson");
if (target) {
  target.rank = wilkinson.rank;
  target.projectedBbpr = wilkinson.projectedBbpr;
}
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`${wilkinson.rank}\t${wilkinson.player}\t${wilkinson.projectedBbpr}`);
