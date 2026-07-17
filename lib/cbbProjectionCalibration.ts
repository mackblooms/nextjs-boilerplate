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
>;

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
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

  if (role >= 95 && entry >= 98 && nba >= 95) return player.playerType === "International" ? 89 : 91;
  if (role >= 90 && entry >= 94 && nba >= 85) return player.playerType === "International" ? 84 : 86;
  if (role >= 85) return 84;
  if (role >= 75) return 81;
  return 78;
}

function newcomerCredibility(suggestion: CalibrationSuggestion) {
  const role = numeric(suggestion.projectedRole) ?? 0;
  const entry = numeric(suggestion.entryTalentGrade) ?? 0;
  const nba = numeric(suggestion.nbaProjectionScore) ?? 0;

  if (role >= 95 && entry >= 98 && nba >= 95) return 0.72;
  if (role >= 88 && entry >= 92 && nba >= 85) return 0.62;
  if (role >= 80 && entry >= 84) return 0.58;
  return 0.54;
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

export function calibrateProjectedBbpr(
  player: CalibrationPlayer,
  suggestion: CalibrationSuggestion
) {
  const projectionScore = numeric(suggestion.projectionScore);
  if (projectionScore == null) return numeric(suggestion.projectedBbpr);

  if (isNewcomer(player.playerType)) {
    const credibility = newcomerCredibility(suggestion);
    const compressed = 75 + (projectionScore - 75) * credibility;
    return round(Math.min(compressed, newcomerCap(player, suggestion)));
  }

  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  if (historical == null) return round(projectionScore);

  if (player.playerType === "Returning") {
    const historicalWeight = returningHistoricalWeight(player, suggestion);
    return round(historical * historicalWeight + projectionScore * (1 - historicalWeight));
  }

  return round(historical * 0.75 + projectionScore * 0.25);
}
