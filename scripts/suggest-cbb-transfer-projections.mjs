import fs from "node:fs";
import path from "node:path";

const projectionPath = path.resolve("data", "cbb", "player-projections.json");
const goldConfigPath = path.resolve("data", "cbb", "gold-standard-rows.json");
const outputPath = path.resolve("data", "cbb", "transfer-projection-suggestions.json");

const data = JSON.parse(fs.readFileSync(projectionPath, "utf8"));
const goldConfig = JSON.parse(fs.readFileSync(goldConfigPath, "utf8"));

const TRANSFER_GOLD_ROWS = new Set(goldConfig.groups.Transfer ?? []);
const FEATURE_FIELDS = [
  "historicalRating",
  "historicalBbpr",
  "starScore",
  "difficulty",
  "age",
  "heightInches",
];

const SUGGESTION_FIELDS = [
  "projectedRole",
  "opportunityChange",
  "offensiveBurden",
  "nbaProjectionScore",
  "upsideToolsScore",
];

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function roundToStep(value, step = 5) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value / step) * step));
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

function minMax(players, field) {
  const values = players.map((player) => numberOrNull(player[field])).filter((value) => value != null);
  if (values.length === 0) return { min: 0, max: 1 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

function normalize(value, range) {
  if (value == null) return null;
  if (range.max === range.min) return 0.5;
  return (value - range.min) / (range.max - range.min);
}

function distance(left, right, ranges) {
  let total = 0;
  let count = 0;

  for (const field of FEATURE_FIELDS) {
    const leftValue = normalize(numberOrNull(left[field]), ranges[field]);
    const rightValue = normalize(numberOrNull(right[field]), ranges[field]);
    if (leftValue == null || rightValue == null) continue;
    total += (leftValue - rightValue) ** 2;
    count += 1;
  }

  if (count === 0) return Number.POSITIVE_INFINITY;
  return Math.sqrt(total / count);
}

function weightedAverage(neighbors, field) {
  let weighted = 0;
  let totalWeight = 0;

  for (const neighbor of neighbors) {
    const value = numberOrNull(neighbor.player[field]);
    if (value == null) continue;
    weighted += value * neighbor.weight;
    totalWeight += neighbor.weight;
  }

  if (totalWeight === 0) return null;
  return weighted / totalWeight;
}

function majorityStarter(neighbors) {
  let yes = 0;
  let no = 0;

  for (const neighbor of neighbors) {
    const starter = String(neighbor.player.projectedStarter ?? "").toLowerCase();
    if (starter === "yes") yes += neighbor.weight;
    if (starter === "no") no += neighbor.weight;
  }

  if (yes === 0 && no === 0) return null;
  return yes >= no ? "Yes" : "No";
}

function completionTarget(player) {
  return player.needsReview || player.projectedBbpr == null || player.projectionScore == null;
}

function computeOpportunityScore(projectedRole, opportunityChange, offensiveBurden) {
  if ([projectedRole, opportunityChange, offensiveBurden].some((value) => value == null)) return null;
  return round(projectedRole * 0.5 + opportunityChange * 0.3 + offensiveBurden * 0.2, 2);
}

function computeTalentScore(nbaProjectionScore, upsideToolsScore) {
  if ([nbaProjectionScore, upsideToolsScore].some((value) => value == null)) return null;
  return round(nbaProjectionScore * 0.6 + upsideToolsScore * 0.4, 2);
}

function computeProjectionScore(opportunityScore, talentScore, developmentScore) {
  if ([opportunityScore, talentScore, developmentScore].some((value) => value == null)) return null;
  return round(opportunityScore * 0.45 + talentScore * 0.35 + developmentScore * 0.2, 3);
}

function computeProjectedBbpr(historicalRating, projectionScore) {
  if (historicalRating == null || projectionScore == null) return null;
  return round(historicalRating * 0.75 + projectionScore * 0.25, 4);
}

function starterReason(starter) {
  if (starter === "Yes") {
    return "nearest trusted transfers lean starter/major-minute profile";
  }
  if (starter === "No") {
    return "nearest trusted transfers lean bench/rotation profile";
  }
  return "starter status requires manual research";
}

const transfers = data.players.filter((player) => player.playerType === "Transfer");
const completedGoldTransfers = transfers.filter(
  (player) =>
    TRANSFER_GOLD_ROWS.has(player.sourceRow) &&
    !player.needsReview &&
    SUGGESTION_FIELDS.every((field) => numberOrNull(player[field]) != null) &&
    numberOrNull(player.projectedBbpr) != null
);

if (completedGoldTransfers.length === 0) {
  throw new Error("No completed transfer gold standards were found.");
}

const ranges = Object.fromEntries(FEATURE_FIELDS.map((field) => [field, minMax(transfers, field)]));
const targets = transfers
  .filter((player) => !TRANSFER_GOLD_ROWS.has(player.sourceRow))
  .filter(completionTarget)
  .sort((a, b) => a.sourceRow - b.sourceRow);

const suggestions = targets.map((player) => {
  const nearest = completedGoldTransfers
    .map((goldPlayer) => {
      const d = distance(player, goldPlayer, ranges);
      return {
        player: goldPlayer,
        distance: d,
        weight: Number.isFinite(d) ? 1 / Math.max(d, 0.08) : 0,
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  const projectedStarter = majorityStarter(nearest);
  const projectedRole = roundToStep(weightedAverage(nearest, "projectedRole"));
  const opportunityChange = roundToStep(weightedAverage(nearest, "opportunityChange"));
  const offensiveBurden = roundToStep(weightedAverage(nearest, "offensiveBurden"));
  const nbaProjectionScore = roundToStep(weightedAverage(nearest, "nbaProjectionScore"));
  const upsideToolsScore = roundToStep(weightedAverage(nearest, "upsideToolsScore"));
  const opportunityScore = computeOpportunityScore(projectedRole, opportunityChange, offensiveBurden);
  const talentScore = computeTalentScore(nbaProjectionScore, upsideToolsScore);
  const developmentScore = numberOrNull(player.developmentScore);
  const projectionScore = computeProjectionScore(opportunityScore, talentScore, developmentScore);
  const projectedBbpr = computeProjectedBbpr(numberOrNull(player.historicalRating), projectionScore);
  const confidenceScore = 60;

  return {
    sourceRow: player.sourceRow,
    player: player.player,
    currentTeam: player.currentTeam,
    previousTeam: player.previousTeam,
    position: player.position,
    classYear: player.classYear,
    current: {
      historicalRating: player.historicalRating,
      historicalBbpr: player.historicalBbpr,
      starScore: player.starScore,
      difficulty: player.difficulty,
      developmentScore: player.developmentScore,
      projectedBbpr: player.projectedBbpr,
      needsReview: player.needsReview,
    },
    suggested: {
      projectedStarter,
      projectedRole,
      opportunityChange,
      offensiveBurden,
      opportunityScore,
      nbaProjectionScore,
      upsideToolsScore,
      talentScore,
      developmentScore,
      projectionScore,
      projectedBbpr,
      confidenceScore,
      confidenceGrade: confidenceGrade(confidenceScore),
      needsReview: true,
      suggestionStatus: "draft",
    },
    nearestGoldExamples: nearest.map((neighbor) => ({
      sourceRow: neighbor.player.sourceRow,
      player: neighbor.player.player,
      currentTeam: neighbor.player.currentTeam,
      previousTeam: neighbor.player.previousTeam,
      projectedStarter: neighbor.player.projectedStarter,
      projectedBbpr: neighbor.player.projectedBbpr,
      projectionScore: neighbor.player.projectionScore,
      opportunityScore: neighbor.player.opportunityScore,
      talentScore: neighbor.player.talentScore,
      distance: round(neighbor.distance, 4),
    })),
    reasoning: [
      "draft suggestion generated from nearest completed transfer gold-standard examples",
      starterReason(projectedStarter),
      "verify expected starting role/minutes with roster news, depth chart context, and transfer destination reporting",
      "verify NBA/draft/tools inputs with mock drafts, scouting sentiment, and player-specific research",
      "manual spreadsheet inputs should override this suggestion",
    ],
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  sourceWorkbook: data.sourceWorkbook,
  targetPlayerType: "Transfer",
  goldStandardCount: completedGoldTransfers.length,
  transferCount: transfers.length,
  targetCount: targets.length,
  suggestionCount: suggestions.length,
  formulas: {
    opportunityScore: "projectedRole*0.50 + opportunityChange*0.30 + offensiveBurden*0.20",
    talentScore: "nbaProjectionScore*0.60 + upsideToolsScore*0.40",
    projectionScore: "opportunityScore*0.45 + talentScore*0.35 + developmentScore*0.20",
    projectedBbpr: "historicalRating*0.75 + projectionScore*0.25",
  },
  caveats: [
    "This is a calibration-based draft, not a replacement for player-specific research.",
    "The script does not yet ingest minutes projections, mock drafts, roster news, or sentiment feeds.",
    "Projected Starter, Projected Role, and Opportunity Change must be capped by upcoming-team lineup/depth context before acceptance.",
    "Lower-major stars moving into crowded high-major rosters should not automatically receive starter or 80+ role assumptions.",
    "All suggestions keep needsReview=true until manually accepted.",
  ],
};

const payload = { summary, suggestions };
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Transfer suggestion audit`);
console.log(`Gold standards: ${summary.goldStandardCount}`);
console.log(`Transfers: ${summary.transferCount}`);
console.log(`Targets: ${summary.targetCount}`);
console.log(`Suggestions written: ${summary.suggestionCount}`);
console.log(`Output: ${outputPath}`);

console.table(
  suggestions.slice(0, 20).map((suggestion) => ({
    row: suggestion.sourceRow,
    player: suggestion.player,
    team: suggestion.currentTeam,
    starter: suggestion.suggested.projectedStarter,
    role: suggestion.suggested.projectedRole,
    opp: suggestion.suggested.opportunityScore,
    talent: suggestion.suggested.talentScore,
    proj: suggestion.suggested.projectionScore,
    bbpr: suggestion.suggested.projectedBbpr,
  }))
);
