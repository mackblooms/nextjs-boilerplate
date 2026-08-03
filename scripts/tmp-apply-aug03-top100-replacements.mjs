import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data", "cbb");
const projectionsPath = path.join(dataDir, "player-projections.json");
const reportPath = path.join(dataDir, "player-top100-replacements-2026-08-03.json");
const now = "2026-08-03T12:00:00.000Z";

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isNewcomer(playerType) {
  return playerType === "Freshman" || playerType === "International";
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

function newcomerCap(player, suggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;
  const internationalAdjustment = player.playerType === "International" ? -3 : 0;

  if (role >= 99 && entry >= 99 && nba >= 98) return 87 + internationalAdjustment;
  if (role >= 98 && entry >= 98 && nba >= 95) return 86 + internationalAdjustment;
  if (role >= 97 && entry >= 98 && nba >= 95) return 84.5 + internationalAdjustment;
  if (role >= 96 && entry >= 98 && nba >= 94) return 83.6 + internationalAdjustment;
  if (role >= 95 && entry >= 98 && nba >= 94) return 82.5 + internationalAdjustment;
  if (role >= 93 && entry >= 98 && nba >= 94) return 79 + internationalAdjustment;
  if (role >= 92 && entry >= 97 && nba >= 92) return 78.5 + internationalAdjustment;
  if (role >= 91 && entry >= 97 && nba >= 92) return 77.5 + internationalAdjustment;
  if (role >= 90 && entry >= 95 && nba >= 90) return 77 + internationalAdjustment;
  if (role >= 90 && entry >= 98 && nba >= 94) return 79 + internationalAdjustment;
  if (role >= 88 && entry >= 96 && nba >= 90) return 75 + internationalAdjustment;
  if (role >= 90 && entry >= 95 && nba >= 85) return 72.5 + internationalAdjustment;
  if (role >= 86 && entry >= 94 && nba >= 88) return 72 + internationalAdjustment;
  if (role >= 84 && entry >= 94 && nba >= 88) return 70.5 + internationalAdjustment;
  if (role >= 80 && entry >= 90 && nba >= 84) return 67 + internationalAdjustment;
  if (role >= 85) return 66.5 + internationalAdjustment;
  if (role >= 75) return 64.5 + internationalAdjustment;
  return 62 + internationalAdjustment;
}

function newcomerCredibility(suggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;

  if (role >= 99 && entry >= 99 && nba >= 98) return 0.65;
  if (role >= 98 && entry >= 98 && nba >= 95) return 0.62;
  if (role >= 97 && entry >= 98 && nba >= 95) return 0.58;
  if (role >= 96 && entry >= 98 && nba >= 94) return 0.54;
  if (role >= 95 && entry >= 98 && nba >= 94) return 0.48;
  if (role >= 93 && entry >= 98 && nba >= 94) return 0.38;
  if (role >= 92 && entry >= 97 && nba >= 92) return 0.34;
  if (role >= 91 && entry >= 97 && nba >= 92) return 0.32;
  if (role >= 90 && entry >= 95 && nba >= 90) return 0.3;
  if (role >= 90 && entry >= 96 && nba >= 90) return 0.25;
  if (role >= 86 && entry >= 94 && nba >= 88) return 0.18;
  if (role >= 80 && entry >= 88) return 0.14;
  return 0.1;
}

function newcomerCertainty(suggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const opportunity = numeric(suggestion.opportunityScore) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;
  const confidence = numeric(suggestion.confidenceScore) ?? 65;
  const talent = numeric(suggestion.talentScore) ?? 0;

  return clamp(
    role * 0.0015 +
      opportunity * 0.0012 +
      entry * 0.001 +
      nba * 0.0008 +
      confidence * 0.0007 +
      talent * 0.0004,
    0,
    1
  );
}

function newcomerTierSpread(suggestion, cap, isCapLimited) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const opportunity = numeric(suggestion.opportunityScore) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;
  const confidence = numeric(suggestion.confidenceScore) ?? 65;
  const projectionScore = numeric(suggestion.projectionScore) ?? 0;
  const spreadLimit = isCapLimited
    ? cap >= 84
      ? 1.1
      : cap >= 76
        ? 1.7
        : cap >= 70
          ? 1.9
          : 1.55
    : cap >= 84
      ? 0.45
      : cap >= 76
        ? 1.35
        : cap >= 70
          ? 1.55
          : 1.25;
  const profileSignal =
    (role - 87) * 0.14 +
    (opportunity - 83) * 0.07 +
    (entry - 96) * 0.04 +
    (nba - 90) * 0.04 +
    (confidence - 78) * 0.05 +
    (projectionScore - 89) * 0.025;
  const uncertaintyDrag =
    clamp((82 - role) * 0.08, 0, 0.65) +
    clamp((78 - opportunity) * 0.05, 0, 0.5) +
    clamp((75 - confidence) * 0.06, 0, 0.9) +
    (role >= 98 ? 0 : clamp((70 - confidence) * 0.12, 0, 0.6));

  return clamp(profileSignal, -spreadLimit, spreadLimit) - uncertaintyDrag;
}

function calibrateNewcomer(player, suggestion) {
  const projectionScore = numeric(suggestion.projectionScore);
  if (projectionScore == null) return numeric(suggestion.projectedBbpr);

  const cap = newcomerCap(player, suggestion);
  const compressed = 66 + (projectionScore - 66) * newcomerCredibility(suggestion);
  const role = numeric(suggestion.projectedRole) ?? 0;
  const certainty = newcomerCertainty(suggestion);
  const capBand = cap >= 84 ? 4 : cap >= 76 ? 5 : cap >= 70 ? 5.5 : 4.5;
  const roleLift = clamp((role - 96) * 0.1, 0, 0.5);
  const overflowLift = clamp((compressed - cap) * 0.06, 0, 0.25);
  const isCapLimited = compressed > cap;
  const baseScore = isCapLimited
    ? cap - capBand * (1 - certainty) + roleLift + overflowLift
    : compressed;

  return round(baseScore + newcomerTierSpread(suggestion, cap, isCapLimited));
}

function returningHistoricalWeight(player, suggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const opportunity = numeric(suggestion.opportunityScore) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;
  const development = numeric(player.developmentScore) ?? 0;
  const classYear = player.classYear;

  if (classYear === "So" && development >= 80 && role >= 95 && opportunity >= 90 && nba >= 85) return 0.2;
  if (classYear === "So" && development >= 80 && role >= 92 && opportunity >= 85 && nba >= 80) return 0.3;
  if (development >= 80 && role >= 85 && opportunity >= 80) return 0.35;
  if (role >= 92 && opportunity >= 84 && nba >= 75) return 0.4;
  if (role >= 82 && opportunity >= 75) return 0.5;
  return 0.6;
}

function applyReturningStarLift(player, suggestion, blendedScore) {
  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  const role = numeric(suggestion.projectedRole) ?? 0;
  const opportunity = numeric(suggestion.opportunityScore) ?? 0;
  const talent = numeric(suggestion.talentScore) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;
  const confidence = numeric(suggestion.confidenceScore) ?? 0;

  if (
    historical != null &&
    historical >= 78 &&
    role >= 96 &&
    opportunity >= 88 &&
    talent >= 88 &&
    nba >= 85 &&
    confidence >= 85
  ) {
    const provenStarScore =
      88 +
      (historical - 78) * 0.45 +
      (role - 94) * 0.35 +
      (opportunity - 86) * 0.16 +
      (talent - 88) * 0.12 +
      (nba - 80) * 0.05 +
      (confidence - 85) * 0.06;

    return Math.max(blendedScore, clamp(provenStarScore, 88, 94));
  }

  return blendedScore;
}

function applyTransferRoleLift(player, suggestion, blendedScore) {
  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  const role = numeric(suggestion.projectedRole) ?? 0;
  const opportunity = numeric(suggestion.opportunityScore) ?? 0;
  const talent = numeric(suggestion.talentScore) ?? 0;
  const projectionScore = numeric(suggestion.projectionScore) ?? 0;
  const confidence = numeric(suggestion.confidenceScore) ?? 0;

  if (historical != null && historical >= 80 && role >= 95 && opportunity >= 82 && confidence >= 75) {
    const roleScore =
      historical +
      (role - 90) * 0.25 +
      (opportunity - 80) * 0.1 +
      (confidence - 75) * 0.05 +
      1;

    return Math.max(blendedScore, clamp(roleScore, 82, 89));
  }

  if (
    historical != null &&
    role >= 92 &&
    opportunity >= 88 &&
    talent >= 80 &&
    projectionScore >= 76 &&
    confidence >= 88
  ) {
    const provenTransferScore =
      68 +
      (role - 90) * 0.35 +
      (opportunity - 86) * 0.18 +
      (talent - 78) * 0.16 +
      (projectionScore - 76) * 0.12 +
      (confidence - 85) * 0.08 +
      clamp((historical - 40) * 0.08, -1, 2);

    return Math.max(blendedScore, clamp(provenTransferScore, 68, 78));
  }

  if (
    historical != null &&
    role >= 90 &&
    opportunity >= 86 &&
    talent >= 78 &&
    projectionScore >= 75 &&
    confidence >= 86
  ) {
    const startingTransferScore =
      65 +
      (role - 90) * 0.25 +
      (opportunity - 86) * 0.15 +
      (talent - 78) * 0.12 +
      (projectionScore - 75) * 0.1 +
      (confidence - 85) * 0.06 +
      clamp((historical - 40) * 0.05, -0.75, 1.5);

    return Math.max(blendedScore, clamp(startingTransferScore, 65, 73));
  }

  return blendedScore;
}

function calibrateProjectedBbpr(player, suggestion) {
  const projectionScore = numeric(suggestion.projectionScore);
  if (projectionScore == null) return numeric(suggestion.projectedBbpr);

  if (isNewcomer(player.playerType)) return calibrateNewcomer(player, suggestion);

  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  if (historical == null) return round(projectionScore);

  if (player.playerType === "Returning") {
    const weight = returningHistoricalWeight(player, suggestion);
    const blended = historical * weight + projectionScore * (1 - weight);
    return round(applyReturningStarLift(player, suggestion, blended));
  }

  const blended = historical * 0.75 + projectionScore * 0.25;
  if (player.playerType === "Transfer") return round(applyTransferRoleLift(player, suggestion, blended));
  return round(blended);
}

function score(player, input) {
  const suggestion = { ...input };
  suggestion.opportunityScore = round(
    suggestion.projectedRole * 0.5 + suggestion.opportunityChange * 0.3 + suggestion.offensiveBurden * 0.2,
    2
  );
  suggestion.talentScore = isNewcomer(player.playerType)
    ? round(
        suggestion.entryTalentGrade * 0.4 +
          suggestion.nbaProjectionScore * 0.35 +
          suggestion.upsideToolsScore * 0.25,
        2
      )
    : round(suggestion.nbaProjectionScore * 0.6 + suggestion.upsideToolsScore * 0.4, 2);
  suggestion.projectionScore = round(
    suggestion.opportunityScore * 0.45 + suggestion.talentScore * 0.35 + suggestion.developmentScore * 0.2,
    4
  );
  const scoringPlayer = {
    ...player,
    historicalRating: input.historicalRating,
    developmentScore: input.developmentScore,
  };
  suggestion.projectedBbpr = calibrateProjectedBbpr(scoringPlayer, suggestion);
  suggestion.confidenceGrade = confidenceGrade(suggestion.confidenceScore);
  suggestion.needsReview = false;
  return suggestion;
}

function clearProjection(player, reason) {
  for (const key of [
    "historicalRating",
    "projectedStarter",
    "projectedRole",
    "opportunityChange",
    "offensiveBurden",
    "opportunityScore",
    "entryTalentGrade",
    "nbaProjectionScore",
    "upsideToolsScore",
    "talentScore",
    "projectionScore",
    "projectedBbpr",
  ]) {
    player[key] = null;
  }
  player.projectionInputCompleteness = 0;
  player.confidenceScore = player.baseConfidence ?? 55;
  player.confidenceGrade = confidenceGrade(player.confidenceScore);
  player.needsReview = true;
  player.projectionNotes = reason;
  player.lastUpdated = now;
}

function assignProjection(player, input, reason) {
  player.historicalRating = input.historicalRating;
  const scored = score(player, input);
  for (const [key, value] of Object.entries(scored)) player[key] = value;
  player.projectionInputCompleteness = 100;
  player.projectionNotes = reason;
  player.lastUpdated = now;
}

function snapshot(player) {
  if (!player) return null;
  return {
    rank: player.rank,
    historicalRating: player.historicalRating,
    projectedBbpr: player.projectedBbpr,
    projectedRole: player.projectedRole,
    opportunityChange: player.opportunityChange,
    offensiveBurden: player.offensiveBurden,
    opportunityScore: player.opportunityScore,
    entryTalentGrade: player.entryTalentGrade,
    nbaProjectionScore: player.nbaProjectionScore,
    upsideToolsScore: player.upsideToolsScore,
    talentScore: player.talentScore,
    projectionScore: player.projectionScore,
    confidenceScore: player.confidenceScore,
  };
}

function comparePlayers(left, right) {
  const scoreDiff = (numeric(right.projectedBbpr) ?? -1) - (numeric(left.projectedBbpr) ?? -1);
  if (scoreDiff !== 0) return scoreDiff;
  const confidenceDiff = (numeric(right.confidenceScore) ?? -1) - (numeric(left.confidenceScore) ?? -1);
  if (confidenceDiff !== 0) return confidenceDiff;
  return String(left.player).localeCompare(String(right.player));
}

const data = JSON.parse(fs.readFileSync(projectionsPath, "utf8"));
const players = data.players;
const oldRank80to100 = players
  .filter((player) => player.rank >= 80 && player.rank <= 100)
  .sort((a, b) => a.rank - b.rank)
  .map((player) => `${player.rank}:${player.player}`);

const changes = [];
function track(player, label, mutate) {
  const old = snapshot(player);
  mutate();
  changes.push({ label, sourceRow: player.sourceRow, player: player.player, old, new: snapshot(player) });
}

const uriah = players.find((player) => player.player === "Uriah Tenette");
const jeremiah = players.find((player) => player.player === "Jeremiah Wilkinson");
const roberts = players.find((player) => player.player === "Desmond Roberts");
const miikka = players.find((player) => player.player === "Miikka Muurinen");
const billy = players.find((player) => player.player === "Billy Richmond III");

track(uriah, "demote-replaced-uriah-tenette", () =>
  assignProjection(
    uriah,
    {
      historicalRating: 64,
      projectedStarter: "Uncertain",
      projectedRole: 82,
      opportunityChange: 78,
      offensiveBurden: 76,
      entryTalentGrade: null,
      nbaProjectionScore: 62,
      upsideToolsScore: 72,
      developmentScore: 80,
      confidenceScore: 72,
    },
    "Removed from the top-100 slot after user review; freshman production and low-turnover profile are useful, but not strong enough for the current top-100 board."
  )
);

track(jeremiah, "replace-uriah-with-jeremiah-wilkinson", () =>
  assignProjection(
    jeremiah,
    {
      historicalRating: 77.2,
      projectedStarter: "Yes",
      projectedRole: 96,
      opportunityChange: 90,
      offensiveBurden: 94,
      entryTalentGrade: null,
      nbaProjectionScore: 84,
      upsideToolsScore: 88,
      developmentScore: 40,
      confidenceScore: 92,
    },
    "Replaces Uriah Tenette in the top-100 band after Arkansas added an SEC-proven scorer who led Georgia at 17.4 PPG and owns two years of high-major scoring production."
  )
);

track(roberts, "clear-desmond-roberts", () =>
  clearProjection(
    roberts,
    "Cleared after user review: no reliable production/projection basis strong enough to support a top-100 ranking."
  )
);

track(miikka, "demote-miikka-muurinen", () =>
  assignProjection(
    miikka,
    {
      historicalRating: 72,
      projectedStarter: "Uncertain",
      projectedRole: 86,
      opportunityChange: 82,
      offensiveBurden: 78,
      entryTalentGrade: 97,
      nbaProjectionScore: 94,
      upsideToolsScore: 96,
      developmentScore: 100,
      confidenceScore: 80,
    },
    "Removed from the #40 range after user review; still a high-upside Arkansas international, but role uncertainty moves him outside the current top-100 board."
  )
);

track(billy, "move-billy-richmond-into-70s", () =>
  assignProjection(
    billy,
    {
      historicalRating: 70.6,
      projectedStarter: "Yes",
      projectedRole: 91,
      opportunityChange: 90,
      offensiveBurden: 84,
      entryTalentGrade: null,
      nbaProjectionScore: 82,
      upsideToolsScore: 88,
      developmentScore: 60,
      confidenceScore: 88,
    },
    "Moved into the 70s after user review as the better Arkansas top-100 fit than Miikka: proven returning athletic/defensive role with enough tools to project."
  )
);

let kusturica = players.find((player) => player.player === "Nikola Kusturica");
if (!kusturica) {
  kusturica = {
    id: "nikola-kusturica__ucla__fr",
    sourceRow: Math.max(...players.map((player) => player.sourceRow ?? 0)) + 1,
    rank: null,
    player: "Nikola Kusturica",
    currentTeam: "UCLA",
    previousTeam: null,
    position: "GF",
    classYear: "Fr",
    playerType: "Freshman",
    heightInches: 81,
    age: 17.3,
    recruitingRank: null,
    recruitingTier: null,
    historicalBbpr: null,
    starScore: null,
    difficulty: null,
    historicalRating: null,
    projectedStarter: null,
    projectedRole: null,
    opportunityChange: null,
    offensiveBurden: null,
    opportunityScore: null,
    entryTalentGrade: null,
    nbaProjectionScore: null,
    upsideToolsScore: null,
    talentScore: null,
    developmentScore: 100,
    projectionScore: null,
    projectedBbpr: null,
    projectionInputCompleteness: 0,
    baseConfidence: 45,
    confidenceScore: 45,
    confidenceGrade: "D",
    needsReview: true,
    projectionNotes: "Added after UCLA signing; projection pending.",
    lastUpdated: null,
  };
  players.push(kusturica);
}

track(kusturica, "replace-roberts-with-nikola-kusturica", () =>
  assignProjection(
    kusturica,
    {
      historicalRating: 76,
      projectedStarter: "Yes",
      projectedRole: 90,
      opportunityChange: 94,
      offensiveBurden: 90,
      entryTalentGrade: 100,
      nbaProjectionScore: 100,
      upsideToolsScore: 99,
      developmentScore: 100,
      confidenceScore: 86,
    },
    "Replaces Desmond Roberts in the top-100 band after UCLA signed a very young Serbian wing/guard as an incoming freshman with elite international production and credible 2028 No. 1 pick upside."
  )
);

const ranked = players.filter((player) => numeric(player.projectedBbpr) != null).sort(comparePlayers);
for (const player of players) player.rank = null;
for (const [index, player] of ranked.entries()) player.rank = index + 1;

data.generatedAt = now;
data.summary.playerCount = players.length;
data.summary.projectedCount = players.filter((player) => numeric(player.projectedBbpr) != null).length;
data.summary.needsReviewCount = players.filter((player) => player.needsReview).length;
data.summary.byType = players.reduce((acc, player) => {
  acc[player.playerType ?? "Unknown"] = (acc[player.playerType ?? "Unknown"] ?? 0) + 1;
  return acc;
}, {});
data.summary.byClass = players.reduce((acc, player) => {
  acc[player.classYear ?? "Unknown"] = (acc[player.classYear ?? "Unknown"] ?? 0) + 1;
  return acc;
}, {});

for (const change of changes) {
  const player = players.find((item) => item.sourceRow === change.sourceRow);
  change.new = snapshot(player);
}

fs.writeFileSync(projectionsPath, `${JSON.stringify(data, null, 2)}\n`);

const batchUpdates = new Map(
  [uriah, jeremiah, roberts, miikka, billy].map((player) => [player.sourceRow, player])
);
for (const file of fs.readdirSync(dataDir).filter((name) => /^player-research-batch-\d+\.json$/.test(name))) {
  const batchPath = path.join(dataDir, file);
  const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
  let changed = false;
  for (const entry of batch.players ?? []) {
    const projected = batchUpdates.get(entry.sourceRow);
    if (!projected) continue;
    entry.currentTeam = projected.currentTeam;
    entry.previousTeam = projected.previousTeam;
    entry.historicalRating = projected.historicalRating;
    entry.developmentScore = projected.developmentScore;
    entry.researchSummary = projected.projectionNotes;
    if (entry.suggested) {
      for (const key of [
        "projectedStarter",
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
        "confidenceGrade",
        "needsReview",
      ]) {
        entry.suggested[key] = projected[key];
      }
    }
    changed = true;
  }
  if (changed) fs.writeFileSync(batchPath, `${JSON.stringify(batch, null, 2)}\n`);
}

const newRank80to100 = players
  .filter((player) => player.rank >= 80 && player.rank <= 100)
  .sort((a, b) => a.rank - b.rank)
  .map((player) => `${player.rank}:${player.player}`);

const targetNames = new Set([
  "Jeremiah Wilkinson",
  "Nikola Kusturica",
  "Billy Richmond III",
  "Uriah Tenette",
  "Desmond Roberts",
  "Miikka Muurinen",
]);

const report = {
  generatedAt: now,
  scope: "User-directed top-100 replacements for Uriah Tenette, Desmond Roberts, and Miikka Muurinen.",
  method: [
    "Used the existing returning/transfer/newcomer calibration formulas.",
    "Added Nikola Kusturica directly to the projection engine because he was not present locally.",
    "Kept replacements above the pre-existing #80 line so the #80-#100 player set remains unchanged.",
  ],
  changes,
  targetRanks: ranked
    .filter((player) => targetNames.has(player.player))
    .map((player) => ({
      rank: player.rank,
      player: player.player,
      team: player.currentTeam,
      projectedBbpr: player.projectedBbpr,
    })),
  oldRank80to100,
  newRank80to100,
  rank80to100Unchanged: JSON.stringify(oldRank80to100) === JSON.stringify(newRank80to100),
  top100Line: ranked.at(99)?.projectedBbpr,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

for (const item of report.targetRanks) {
  console.log(`${item.rank ?? "null"}\t${item.player}\t${item.projectedBbpr ?? "null"}`);
}
console.log(`rank80to100Unchanged\t${report.rank80to100Unchanged}`);
console.log(`top100Line\t${report.top100Line}`);
