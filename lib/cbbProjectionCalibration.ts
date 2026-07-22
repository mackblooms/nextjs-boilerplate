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
  const internationalAdjustment = player.playerType === "International" ? -3 : 0;

  if (role >= 98 && entry >= 98 && nba >= 95) return 87 + internationalAdjustment;
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

function newcomerCredibility(suggestion: CalibrationSuggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;

  if (role >= 98 && entry >= 98 && nba >= 95) return 0.65;
  if (role >= 90 && entry >= 96 && nba >= 90) return 0.25;
  if (role >= 86 && entry >= 94 && nba >= 88) return 0.18;
  if (role >= 80 && entry >= 88) return 0.14;
  return 0.1;
}

function newcomerCertainty(suggestion: CalibrationSuggestion) {
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

function newcomerTierSpread(suggestion: CalibrationSuggestion, cap: number, isCapLimited: boolean) {
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

function calibrateNewcomer(player: CalibrationPlayer, suggestion: CalibrationSuggestion) {
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
  const tierSpread = newcomerTierSpread(suggestion, cap, isCapLimited);

  return round(baseScore + tierSpread);
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
