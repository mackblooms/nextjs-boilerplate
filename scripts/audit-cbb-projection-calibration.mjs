import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data", "cbb");
const projectionsPath = path.join(dataDir, "player-projections.json");
const outputPath = path.join(dataDir, "projection-calibration-audit.json");
const researchBatchPattern =
  /^(?:player|transfer|freshman|returning|returner|international)-research-batch-\d+\.json$/;

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalScore(player) {
  return (
    numeric(player.projectedBbpr) ??
    numeric(player.historicalRating) ??
    numeric(player.historicalBbpr) ??
    numeric(player.starScore) ??
    numeric(player.entryTalentGrade)
  );
}

function comparePlayers(left, right) {
  const scoreDiff = (canonicalScore(right) ?? -1) - (canonicalScore(left) ?? -1);
  if (scoreDiff !== 0) return scoreDiff;
  const confidenceDiff = (numeric(right.confidenceScore) ?? -1) - (numeric(left.confidenceScore) ?? -1);
  if (confidenceDiff !== 0) return confidenceDiff;
  return left.player.localeCompare(right.player);
}

function notesText(player) {
  return [
    player.projectionNotes,
    player.researchSummary,
    player.teamContext?.starterEvidence,
    player.teamContext?.roleCap,
    ...(Array.isArray(player.evidence) ? player.evidence.map((item) => item.notes) : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hasHighSentimentText(player) {
  const text = notesText(player);
  return [
    "national scoring",
    "most outstanding player",
    "top-four transfer",
    "top-4 transfer",
    "top-three transfer",
    "top-3 transfer",
    "projected starting",
    "projected starter",
    "all-big",
    "all-acc",
    "all-ivy",
    "all-caa",
    "all-freshman",
    "nba draft",
    "lottery",
    "final four",
    "player of the year",
    "featured star",
    "lead guard",
    "primary scorer",
  ].some((needle) => text.includes(needle));
}

function rankPlayers(players) {
  const ranked = [...players].sort(comparePlayers);
  return new Map(ranked.map((player, index) => [player.sourceRow, index + 1]));
}

function tierFromRank(rank) {
  if (rank == null) return "unranked";
  if (rank <= 10) return "top 10";
  if (rank <= 25) return "top 25";
  if (rank <= 50) return "top 50";
  if (rank <= 100) return "top 100";
  if (rank <= 150) return "top 150";
  return "outside top 150";
}

function countTypes(players, cutoff) {
  const counts = {};
  for (const player of players.slice(0, cutoff)) {
    const type = player.playerType ?? "Unknown";
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

function buildNewcomerCompositionFindings(rankedPlayers) {
  const top25 = countTypes(rankedPlayers, 25);
  const top50 = countTypes(rankedPlayers, 50);
  const top100 = countTypes(rankedPlayers, 100);
  const top25Newcomers = (top25.Freshman ?? 0) + (top25.International ?? 0);
  const top50Newcomers = (top50.Freshman ?? 0) + (top50.International ?? 0);
  const top100Newcomers = (top100.Freshman ?? 0) + (top100.International ?? 0);
  const findings = [];

  if (top25Newcomers > 5) {
    findings.push({
      code: "newcomer-top25-overload",
      severity: "high",
      message: "More than five freshmen/internationals are in the top 25.",
      count: top25Newcomers,
      targetMax: 5,
    });
  }

  if (top50Newcomers > 10) {
    findings.push({
      code: "newcomer-top50-overload",
      severity: "high",
      message: "More than ten freshmen/internationals are in the top 50.",
      count: top50Newcomers,
      targetMax: 10,
    });
  }

  if (top100Newcomers > 18) {
    findings.push({
      code: "newcomer-top100-overload",
      severity: "high",
      message: "More than 18 freshmen/internationals are in the top 100.",
      count: top100Newcomers,
      targetMax: 18,
    });
  }

  return {
    top25,
    top50,
    top100,
    top25Newcomers,
    top50Newcomers,
    top100Newcomers,
    findings,
  };
}

function auditPlayer(player, rank, top100Line, source) {
  const projectedBbpr = numeric(player.projectedBbpr);
  const projectedRole = numeric(player.projectedRole);
  const opportunityScore = numeric(player.opportunityScore);
  const opportunityChange = numeric(player.opportunityChange);
  const offensiveBurden = numeric(player.offensiveBurden);
  const talentScore = numeric(player.talentScore);
  const projectionScore = numeric(player.projectionScore);
  const confidenceScore = numeric(player.confidenceScore);
  const historicalRating = numeric(player.historicalRating) ?? numeric(player.historicalBbpr);
  const developmentScore = numeric(player.developmentScore);
  const isProjected = projectedBbpr != null;
  const flags = [];

  if (!isProjected) return null;

  if (
    projectedRole != null &&
    opportunityScore != null &&
    talentScore != null &&
    projectedRole >= 94 &&
    opportunityScore >= 90 &&
    talentScore >= 84 &&
    projectedBbpr < 80
  ) {
    flags.push({
      code: "elite-role-below-top-tier",
      severity: "high",
      message: "Elite role/talent inputs are producing a BBPR below the expected top-tier floor.",
    });
  }

  if (
    projectedRole != null &&
    opportunityScore != null &&
    talentScore != null &&
    confidenceScore != null &&
    projectedRole >= 90 &&
    opportunityScore >= 85 &&
    talentScore >= 80 &&
    confidenceScore >= 82 &&
    projectedBbpr < top100Line
  ) {
    flags.push({
      code: "top-100-profile-outside-top-100",
      severity: "high",
      message: "Starter/high-role profile with good talent and confidence sits below the current top-100 line.",
    });
  }

  if (
    player.playerType === "Transfer" &&
    projectionScore != null &&
    projectedRole != null &&
    opportunityScore != null &&
    talentScore != null &&
    projectionScore - projectedBbpr >= 10 &&
    projectedRole >= 88 &&
    opportunityScore >= 84 &&
    talentScore >= 78
  ) {
    flags.push({
      code: "transfer-anchor-drag",
      severity: "high",
      message: "Transfer formula may be over-weighting a stale/low historical anchor against current role research.",
    });
  }

  if (
    player.playerType === "Returning" &&
    developmentScore != null &&
    projectedRole != null &&
    opportunityScore != null &&
    talentScore != null &&
    developmentScore >= 60 &&
    projectedRole >= 90 &&
    opportunityScore >= 86 &&
    talentScore >= 82 &&
    projectedBbpr < 78
  ) {
    flags.push({
      code: "returning-breakout-underweighted",
      severity: "medium",
      message: "Returning player has breakout role/talent inputs but remains below the usual top-100 range.",
    });
  }

  if (
    String(player.projectedStarter ?? "").toLowerCase() === "yes" &&
    projectedRole != null &&
    opportunityChange != null &&
    (projectedRole < 82 || opportunityChange < 72)
  ) {
    flags.push({
      code: "starter-input-conflict",
      severity: "medium",
      message: "Projected starter has low role or opportunity-change inputs that should be rechecked.",
    });
  }

  if (
    hasHighSentimentText(player) &&
    projectedRole != null &&
    talentScore != null &&
    projectedRole >= 88 &&
    talentScore >= 78 &&
    projectedBbpr < top100Line
  ) {
    flags.push({
      code: "sentiment-role-mismatch",
      severity: "medium",
      message: "Research notes contain high-sentiment markers, but the player remains below the top-100 line.",
    });
  }

  if (
    historicalRating != null &&
    projectionScore != null &&
    projectedRole != null &&
    talentScore != null &&
    projectionScore - historicalRating >= 14 &&
    projectedRole >= 88 &&
    talentScore >= 82
  ) {
    flags.push({
      code: "historical-anchor-review",
      severity: "medium",
      message: "Projection model is much higher than the historical anchor; verify the historical anchor still represents the player.",
    });
  }

  if (flags.length === 0) return null;

  return {
    source,
    sourceRow: player.sourceRow,
    player: player.player,
    currentTeam: player.currentTeam,
    previousTeam: player.previousTeam,
    playerType: player.playerType,
    classYear: player.classYear,
    rank,
    rankTier: tierFromRank(rank),
    projectedBbpr,
    top100Line,
    historicalRating,
    projectedRole,
    opportunityChange,
    offensiveBurden,
    opportunityScore,
    talentScore,
    projectionScore,
    confidenceScore,
    flags,
  };
}

function buildResearchSuggestionRecord(batch, player) {
  return {
    ...player,
    ...player.suggested,
    playerType: player.currentProjection?.playerType ?? null,
    classYear: player.currentProjection?.classYear ?? null,
    projectionNotes: player.researchSummary,
    batchId: batch.batchId,
  };
}

const payload = JSON.parse(fs.readFileSync(projectionsPath, "utf8"));
const completedPlayers = payload.players.filter(
  (player) => numeric(player.projectedBbpr) != null && player.projectionInputCompleteness === 100
);
const rankedAllPlayers = [...payload.players].sort(comparePlayers);
const ranks = rankPlayers(payload.players);
const top100Line = canonicalScore(rankedAllPlayers[99]) ?? 0;
const newcomerComposition = buildNewcomerCompositionFindings(rankedAllPlayers);

const projectedFindings = completedPlayers
  .map((player) => auditPlayer(player, ranks.get(player.sourceRow), top100Line, "projection"))
  .filter(Boolean)
  .sort((left, right) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    const leftSeverity = Math.min(...left.flags.map((flag) => severityOrder[flag.severity] ?? 9));
    const rightSeverity = Math.min(...right.flags.map((flag) => severityOrder[flag.severity] ?? 9));
    if (leftSeverity !== rightSeverity) return leftSeverity - rightSeverity;
    return (left.rank ?? 9999) - (right.rank ?? 9999);
  });

const batchFiles = fs.readdirSync(dataDir).filter((entry) => researchBatchPattern.test(entry)).sort();
const researchFindings = [];
for (const file of batchFiles) {
  const batch = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));
  for (const player of batch.players ?? []) {
    const projection = payload.players.find((item) => item.sourceRow === player.sourceRow);
    const isAlreadyApplied =
      projection?.projectionInputCompleteness === 100 && numeric(projection.projectedBbpr) != null;
    if (isAlreadyApplied) continue;

    const record = buildResearchSuggestionRecord(batch, player);
    const finding = auditPlayer(record, null, top100Line, file);
    if (finding) researchFindings.push(finding);
  }
}

const duplicateGroups = Object.values(
  payload.players.reduce((groups, player) => {
    const key = `${normalizeName(player.player)}::${String(player.currentTeam ?? "").toLowerCase()}`;
    groups[key] ??= [];
    groups[key].push({
      sourceRow: player.sourceRow,
      player: player.player,
      currentTeam: player.currentTeam,
      projectedBbpr: player.projectedBbpr,
      needsReview: player.needsReview,
    });
    return groups;
  }, {})
).filter((group) => group.length > 1);

const audit = {
  generatedAt: new Date().toISOString(),
  source: projectionsPath,
  output: outputPath,
  summary: {
    playerCount: payload.players.length,
    completedProjectionCount: completedPlayers.length,
    top100Line: round(top100Line, 4),
    projectedFindingCount: projectedFindings.length,
    highSeverityProjectedFindingCount: projectedFindings.filter((finding) =>
      finding.flags.some((flag) => flag.severity === "high")
    ).length,
    pendingResearchFindingCount: researchFindings.length,
    duplicateGroupCount: duplicateGroups.length,
    newcomerCompositionFindingCount: newcomerComposition.findings.length,
  },
  rules: [
    "Flag completed projections with top-100 role/talent profiles that sit below the current top-100 line.",
    "Flag transfers whose projection inputs are much stronger than the final BBPR because the historical anchor may be stale.",
    "Flag returning breakout candidates whose sophomore/junior role and talent inputs are not translating into a plausible leaderboard tier.",
    "Flag projected starters with low role/opportunity inputs.",
    "Flag players whose research notes contain high-sentiment markers but whose BBPR remains below the top-100 line.",
    "Flag duplicate normalized player/team records before they pollute the board.",
    "Flag top-25/top-50/top-100 newcomer overloads so the board does not become a recruiting ranking.",
  ],
  newcomerComposition,
  projectedFindings,
  pendingResearchFindings: researchFindings,
  duplicateGroups,
};

fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);

console.log("CBB projection calibration audit");
console.log(`Completed projections: ${audit.summary.completedProjectionCount}`);
console.log(`Top-100 line: ${audit.summary.top100Line}`);
console.log(`Projected findings: ${audit.summary.projectedFindingCount}`);
console.log(`High-severity projected findings: ${audit.summary.highSeverityProjectedFindingCount}`);
console.log(`Pending research findings: ${audit.summary.pendingResearchFindingCount}`);
console.log(`Duplicate groups: ${audit.summary.duplicateGroupCount}`);
console.log(`Output: ${outputPath}`);
