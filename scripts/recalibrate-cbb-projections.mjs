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

function newcomerCap(player) {
  const role = numeric(player.projectedRole) ?? 0;
  const entry = numeric(player.entryTalentGrade) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;
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

function newcomerCertainty(player) {
  const role = numeric(player.projectedRole) ?? 0;
  const opportunity = numeric(player.opportunityScore) ?? 0;
  const entry = numeric(player.entryTalentGrade) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;
  const confidence = numeric(player.confidenceScore) ?? 65;
  const talent = numeric(player.talentScore) ?? 0;

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

function newcomerTierSpread(player, cap, isCapLimited) {
  const role = numeric(player.projectedRole) ?? 0;
  const opportunity = numeric(player.opportunityScore) ?? 0;
  const entry = numeric(player.entryTalentGrade) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;
  const confidence = numeric(player.confidenceScore) ?? 65;
  const projectionScore = numeric(player.projectionScore) ?? 0;
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

function calibrateNewcomer(player) {
  const projectionScore = numeric(player.projectionScore);
  if (projectionScore == null) return numeric(player.projectedBbpr);

  const cap = newcomerCap(player);
  const compressed = 66 + (projectionScore - 66) * newcomerCredibility(player);

  const role = numeric(player.projectedRole) ?? 0;
  const certainty = newcomerCertainty(player);
  const capBand = cap >= 84 ? 4 : cap >= 76 ? 5 : cap >= 70 ? 5.5 : 4.5;
  const roleLift = clamp((role - 96) * 0.1, 0, 0.5);
  const overflowLift = clamp((compressed - cap) * 0.06, 0, 0.25);
  const isCapLimited = compressed > cap;
  const baseScore = isCapLimited
    ? cap - capBand * (1 - certainty) + roleLift + overflowLift
    : compressed;
  const tierSpread = newcomerTierSpread(player, cap, isCapLimited);

  return round(baseScore + tierSpread);
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
  const talent = numeric(player.talentScore) ?? 0;
  const projectionScore = numeric(player.projectionScore) ?? 0;
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
