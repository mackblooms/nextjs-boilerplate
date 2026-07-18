import fs from "node:fs";
import path from "node:path";

const projectionPath = path.resolve("data", "cbb", "player-projections.json");

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isNewcomer(playerType) {
  return playerType === "Freshman" || playerType === "International";
}

function newcomerCredibility(player) {
  const role = numeric(player.projectedRole) ?? 0;
  const entry = numeric(player.entryTalentGrade) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;

  if (role >= 98 && entry >= 98 && nba >= 95) return 0.64;
  if (role >= 88 && entry >= 92 && nba >= 85) return 0.48;
  if (role >= 80 && entry >= 84) return 0.44;
  return 0.4;
}

function newcomerCap(player) {
  const role = numeric(player.projectedRole) ?? 0;
  const entry = numeric(player.entryTalentGrade) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;

  if (role >= 98 && entry >= 98 && nba >= 95) return player.playerType === "International" ? 88 : 91;
  if (role >= 90 && entry >= 94 && nba >= 85) return player.playerType === "International" ? 79 : 82;
  if (role >= 85) return 79;
  if (role >= 75) return 76;
  return 73;
}

function newcomerCertainty(player) {
  const role = numeric(player.projectedRole) ?? 0;
  const opportunity = numeric(player.opportunityScore) ?? 0;
  const entry = numeric(player.entryTalentGrade) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;
  const confidence = numeric(player.confidenceScore) ?? 65;
  const talent = numeric(player.talentScore) ?? 0;

  return clamp(
    role * 0.0026 +
      opportunity * 0.0021 +
      entry * 0.0018 +
      nba * 0.0015 +
      confidence * 0.0012 +
      talent * 0.0008,
    0,
    1
  );
}

function calibrateNewcomer(player) {
  const projectionScore = numeric(player.projectionScore);
  if (projectionScore == null) return numeric(player.projectedBbpr);

  const cap = newcomerCap(player);
  const compressed = 75 + (projectionScore - 75) * newcomerCredibility(player);
  if (compressed <= cap) return round(compressed);

  const role = numeric(player.projectedRole) ?? 0;
  const certainty = newcomerCertainty(player);
  const capBand = cap >= 88 ? 2.4 : cap >= 82 ? 2.8 : cap >= 79 ? 5.6 : 3;
  const roleLift = clamp((role - 85) * 0.2, 0, 1.1);
  const overflowLift = clamp((compressed - cap) * 0.18, 0, 0.7);

  return round(cap - capBand * (1 - certainty) + roleLift + overflowLift);
}

function returningHistoricalWeight(player) {
  const role = numeric(player.projectedRole) ?? 0;
  const opportunity = numeric(player.opportunityScore) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;
  const development = numeric(player.developmentScore) ?? 0;

  if (player.classYear === "So" && development >= 80 && role >= 95 && opportunity >= 90 && nba >= 85) {
    return 0.2;
  }

  if (player.classYear === "So" && development >= 80 && role >= 92 && opportunity >= 85 && nba >= 80) {
    return 0.3;
  }

  if (development >= 80 && role >= 85 && opportunity >= 80) return 0.35;
  if (role >= 92 && opportunity >= 84 && nba >= 75) return 0.4;
  if (role >= 82 && opportunity >= 75) return 0.5;
  return 0.6;
}

function applyReturningStarLift(player, blendedScore) {
  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  const role = numeric(player.projectedRole) ?? 0;
  const opportunity = numeric(player.opportunityScore) ?? 0;
  const talent = numeric(player.talentScore) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;
  const confidence = numeric(player.confidenceScore) ?? 0;

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

function applyTransferRoleLift(player, blendedScore) {
  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  const role = numeric(player.projectedRole) ?? 0;
  const opportunity = numeric(player.opportunityScore) ?? 0;
  const confidence = numeric(player.confidenceScore) ?? 0;

  if (historical != null && historical >= 80 && role >= 95 && opportunity >= 82 && confidence >= 75) {
    const roleScore =
      historical +
      (role - 90) * 0.25 +
      (opportunity - 80) * 0.1 +
      (confidence - 75) * 0.05 +
      1;

    return Math.max(blendedScore, clamp(roleScore, 82, 89));
  }

  return blendedScore;
}

function calibrateProjectedBbpr(player) {
  const projectionScore = numeric(player.projectionScore);
  if (projectionScore == null) return numeric(player.projectedBbpr);

  if (isNewcomer(player.playerType)) {
    return calibrateNewcomer(player);
  }

  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  if (historical == null) return round(projectionScore);

  if (player.playerType === "Returning") {
    const historicalWeight = returningHistoricalWeight(player);
    const blendedScore = historical * historicalWeight + projectionScore * (1 - historicalWeight);
    return round(applyReturningStarLift(player, blendedScore));
  }

  const blendedScore = historical * 0.75 + projectionScore * 0.25;
  if (player.playerType === "Transfer") {
    return round(applyTransferRoleLift(player, blendedScore));
  }

  return round(blendedScore);
}

const payload = JSON.parse(fs.readFileSync(projectionPath, "utf8"));
let changed = 0;

const players = payload.players.map((player) => {
  if (player.projectedBbpr == null || player.projectionScore == null) return player;
  const nextProjectedBbpr = calibrateProjectedBbpr(player);
  if (nextProjectedBbpr == null || Math.abs(nextProjectedBbpr - player.projectedBbpr) < 0.0001) {
    return player;
  }
  changed += 1;
  return {
    ...player,
    projectedBbpr: nextProjectedBbpr,
  };
});

const rankedPlayers = [...players]
  .filter((player) => player.projectedBbpr != null)
  .sort((a, b) => {
    const left = a.projectedBbpr ?? Number.NEGATIVE_INFINITY;
    const right = b.projectedBbpr ?? Number.NEGATIVE_INFINITY;
    if (right !== left) return right - left;
    return a.player.localeCompare(b.player);
  });

const rankById = new Map(rankedPlayers.map((player, index) => [player.id, index + 1]));

payload.players = players.map((player) => ({
  ...player,
  rank: rankById.get(player.id) ?? null,
}));
payload.generatedAt = new Date().toISOString();

fs.writeFileSync(projectionPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      changed,
      projectedCount: rankedPlayers.length,
      topTen: rankedPlayers.slice(0, 10).map((player, index) => ({
        rank: index + 1,
        player: player.player,
        type: player.playerType,
        projectedBbpr: player.projectedBbpr,
      })),
    },
    null,
    2
  )
);
