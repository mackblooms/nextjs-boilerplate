import fs from "node:fs";
import path from "node:path";

const projectionPath = path.resolve("data", "cbb", "player-projections.json");

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
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

  if (role >= 95 && entry >= 98 && nba >= 95) return 0.72;
  if (role >= 88 && entry >= 92 && nba >= 85) return 0.62;
  if (role >= 80 && entry >= 84) return 0.58;
  return 0.54;
}

function newcomerCap(player) {
  const role = numeric(player.projectedRole) ?? 0;
  const entry = numeric(player.entryTalentGrade) ?? 0;
  const nba = numeric(player.nbaProjectionScore) ?? 0;

  if (role >= 95 && entry >= 98 && nba >= 95) return player.playerType === "International" ? 89 : 91;
  if (role >= 90 && entry >= 94 && nba >= 85) return player.playerType === "International" ? 84 : 86;
  if (role >= 85) return 84;
  if (role >= 75) return 81;
  return 78;
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

function calibrateProjectedBbpr(player) {
  const projectionScore = numeric(player.projectionScore);
  if (projectionScore == null) return numeric(player.projectedBbpr);

  if (isNewcomer(player.playerType)) {
    const compressed = 75 + (projectionScore - 75) * newcomerCredibility(player);
    return round(Math.min(compressed, newcomerCap(player)));
  }

  const historical = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  if (historical == null) return round(projectionScore);

  if (player.playerType === "Returning") {
    const historicalWeight = returningHistoricalWeight(player);
    return round(historical * historicalWeight + projectionScore * (1 - historicalWeight));
  }

  return round(historical * 0.75 + projectionScore * 0.25);
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
