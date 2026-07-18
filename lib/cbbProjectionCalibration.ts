import type { CbbPlayerProjection, CbbResearchSuggestion } from "@/lib/cbbPlayerProjections";

type CalibrationPlayer = Pick<
  CbbPlayerProjection,
  "playerType" | "classYear" | "historicalRating" | "historicalBbpr" | "developmentScore"
>;

type CalibrationSuggestion = Pick<
  CbbResearchSuggestion,
  | "projectedRole"
  | "opportunityChange"
  | "offensiveBurden"
  | "opportunityScore"
  | "entryTalentGrade"
  | "nbaProjectionScore"
  | "upsideToolsScore"
  | "talentScore"
  | "projectionScore"
  | "projectedBbpr"
  | "confidenceScore"
>;

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function numeric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isNewcomer(playerType: string | null | undefined) {
  return playerType === "Freshman" || playerType === "International";
}

function newcomerCap(player: CalibrationPlayer, suggestion: CalibrationSuggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;

  if (role >= 98 && entry >= 98 && nba >= 95) return player.playerType === "International" ? 88 : 91;
  if (role >= 90 && entry >= 94 && nba >= 85) return player.playerType === "International" ? 79 : 82;
  if (role >= 85) return 79;
  if (role >= 75) return 76;
  return 73;
}

function newcomerCredibility(suggestion: CalibrationSuggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;

  if (role >= 98 && entry >= 98 && nba >= 95) return 0.64;
  if (role >= 88 && entry >= 92 && nba >= 85) return 0.48;
  if (role >= 80 && entry >= 84) return 0.44;
  return 0.4;
}

function newcomerCertainty(suggestion: CalibrationSuggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const opportunity = numeric(suggestion.opportunityScore) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;
  const confidence = numeric(suggestion.confidenceScore) ?? 65;
  const talent = numeric(suggestion.talentScore) ?? 0;

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

function calibrateNewcomer(player: CalibrationPlayer, suggestion: CalibrationSuggestion) {
  const projectionScore = numeric(suggestion.projectionScore);
  if (projectionScore == null) return numeric(suggestion.projectedBbpr);

  const cap = newcomerCap(player, suggestion);
  const compressed = 75 + (projectionScore - 75) * newcomerCredibility(suggestion);
  if (compressed <= cap) return round(compressed);

  const role = numeric(suggestion.projectedRole) ?? 0;
  const certainty = newcomerCertainty(suggestion);
  const capBand = cap >= 88 ? 2.4 : cap >= 82 ? 2.8 : cap >= 79 ? 5.6 : 3;
  const roleLift = clamp((role - 85) * 0.2, 0, 1.1);
  const overflowLift = clamp((compressed - cap) * 0.18, 0, 0.7);

  return round(cap - capBand * (1 - certainty) + roleLift + overflowLift);
}

function returningHistoricalWeight(player: CalibrationPlayer, suggestion: CalibrationSuggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const opportunity = numeric(suggestion.opportunityScore) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;
  const development = numeric(player.developmentScore) ?? 0;
  const classYear = player.classYear;

  if (classYear === "So" && development >= 80 && role >= 95 && opportunity >= 90 && nba >= 85) {
    return 0.2;
  }

  if (classYear === "So" && development >= 80 && role >= 92 && opportunity >= 85 && nba >= 80) {
    return 0.3;
  }

  if (development >= 80 && role >= 85 && opportunity >= 80) {
    return 0.35;
  }

  if (role >= 92 && opportunity >= 84 && nba >= 75) {
    return 0.4;
  }

  if (role >= 82 && opportunity >= 75) {
    return 0.5;
  }

  return 0.6;
}

function applyReturningStarLift(
  player: CalibrationPlayer,
  suggestion: CalibrationSuggestion,
  blendedScore: number
) {
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

function applyTransferRoleLift(
  player: CalibrationPlayer,
  suggestion: CalibrationSuggestion,
  blendedScore: number
) {
  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  const role = numeric(suggestion.projectedRole) ?? 0;
  const opportunity = numeric(suggestion.opportunityScore) ?? 0;
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

  return blendedScore;
}

export function calibrateProjectedBbpr(
  player: CalibrationPlayer,
  suggestion: CalibrationSuggestion
) {
  const projectionScore = numeric(suggestion.projectionScore);
  if (projectionScore == null) return numeric(suggestion.projectedBbpr);

  if (isNewcomer(player.playerType)) {
    return calibrateNewcomer(player, suggestion);
  }

  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  if (historical == null) return round(projectionScore);

  if (player.playerType === "Returning") {
    const historicalWeight = returningHistoricalWeight(player, suggestion);
    const blendedScore = historical * historicalWeight + projectionScore * (1 - historicalWeight);
    return round(applyReturningStarLift(player, suggestion, blendedScore));
  }

  const blendedScore = historical * 0.75 + projectionScore * 0.25;
  if (player.playerType === "Transfer") {
    return round(applyTransferRoleLift(player, suggestion, blendedScore));
  }

  return round(blendedScore);
}
