import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data", "cbb");
const projectionsPath = path.join(dataDir, "player-projections.json");
const reportPath = path.join(dataDir, "player-top100-replacements-2026-08-05.json");
const now = "2026-08-05T12:00:00.000Z";

const replacements = [
  { rank: 83, outgoing: "Owen Freeman", incoming: "Omer Mayer" },
  { rank: 82, outgoing: "Ben Defty", incoming: "Christian Collins" },
  { rank: 79, outgoing: "Dellquan Warren", incoming: "Dedan Thomas Jr." },
  { rank: 77, outgoing: "Kashie Natt", incoming: "Leroy Blyden Jr." },
  { rank: 76, outgoing: "Baye Ndongo", incoming: "Trent Perry" },
  { rank: 67, outgoing: "Jackson Holcombe", incoming: "Dra Gibbs-Lawhorn" },
  { rank: 63, outgoing: "Abdou Toure", incoming: "Isaiah Johnson" },
  { rank: 53, outgoing: "Jaden Toombs", incoming: "Rodney Rice" },
];

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

function normalizeName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function comparePlayers(left, right) {
  const scoreDiff = (numeric(right.projectedBbpr) ?? -1) - (numeric(left.projectedBbpr) ?? -1);
  if (scoreDiff !== 0) return scoreDiff;
  const confidenceDiff = (numeric(right.confidenceScore) ?? -1) - (numeric(left.confidenceScore) ?? -1);
  if (confidenceDiff !== 0) return confidenceDiff;
  return String(left.player).localeCompare(String(right.player));
}

function snapshot(player) {
  return {
    rank: player.rank,
    player: player.player,
    team: player.currentTeam,
    sourceRow: player.sourceRow,
    projectedBbpr: player.projectedBbpr,
    projectionScore: player.projectionScore,
    confidenceScore: player.confidenceScore,
    confidenceGrade: player.confidenceGrade,
    needsReview: player.needsReview,
    projectionNotes: player.projectionNotes,
  };
}

function rerank(players) {
  const ranked = players.filter((player) => numeric(player.projectedBbpr) != null).sort(comparePlayers);
  for (const player of players) player.rank = null;
  for (const [index, player] of ranked.entries()) player.rank = index + 1;
  return ranked;
}

function summarizeRankRange(players, start, end) {
  return players
    .filter((player) => player.rank >= start && player.rank <= end)
    .sort((left, right) => left.rank - right.rank)
    .map((player) => `${player.rank}:${player.player}`);
}

const data = JSON.parse(fs.readFileSync(projectionsPath, "utf8"));
const players = data.players;
const byName = new Map(players.map((player) => [normalizeName(player.player), player]));

for (const spec of replacements) {
  if (!byName.has(normalizeName(spec.outgoing))) throw new Error(`Missing outgoing player: ${spec.outgoing}`);
  if (!byName.has(normalizeName(spec.incoming))) throw new Error(`Missing incoming player: ${spec.incoming}`);
}

const oldRank50to100 = summarizeRankRange(players, 50, 100);
const oldTop100Line = [...players].filter((player) => numeric(player.projectedBbpr) != null).sort(comparePlayers).at(99)
  ?.projectedBbpr;
const changes = [];

const demotionStart = Math.min(oldTop100Line ?? 74.5, 74.5) - 0.1;

for (const [index, spec] of replacements.entries()) {
  const outgoing = byName.get(normalizeName(spec.outgoing));
  const incoming = byName.get(normalizeName(spec.incoming));
  const oldOutgoing = snapshot(outgoing);
  const oldIncoming = snapshot(incoming);

  if (outgoing.rank !== spec.rank) {
    throw new Error(`Expected ${spec.outgoing} at #${spec.rank}, found #${outgoing.rank ?? "null"}`);
  }

  incoming.projectedBbpr = oldOutgoing.projectedBbpr;
  incoming.projectionInputCompleteness = 100;
  incoming.confidenceScore = Math.max(numeric(incoming.confidenceScore) ?? 0, numeric(outgoing.confidenceScore) ?? 80);
  incoming.confidenceGrade = confidenceGrade(incoming.confidenceScore);
  incoming.needsReview = false;
  incoming.projectionNotes = `User-directed top-100 replacement: moved into the #${spec.rank} slot in place of ${outgoing.player}.`;
  incoming.lastUpdated = now;

  outgoing.projectedBbpr = Number((demotionStart - index * 0.05).toFixed(4));
  outgoing.confidenceScore = Math.min(numeric(outgoing.confidenceScore) ?? 80, 78);
  outgoing.confidenceGrade = confidenceGrade(outgoing.confidenceScore);
  outgoing.needsReview = false;
  outgoing.projectionNotes = `Removed from the top-100 board after user-directed replacement by ${incoming.player} at #${spec.rank}.`;
  outgoing.lastUpdated = now;

  changes.push({
    rank: spec.rank,
    outgoing: { old: oldOutgoing, new: null },
    incoming: { old: oldIncoming, new: null },
  });
}

const ranked = rerank(players);

for (const change of changes) {
  const spec = replacements.find((item) => item.rank === change.rank);
  change.outgoing.new = snapshot(byName.get(normalizeName(spec.outgoing)));
  change.incoming.new = snapshot(byName.get(normalizeName(spec.incoming)));
}

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

fs.writeFileSync(projectionsPath, `${JSON.stringify(data, null, 2)}\n`);

const targetNames = new Set(replacements.flatMap((item) => [item.outgoing, item.incoming].map(normalizeName)));
const report = {
  generatedAt: now,
  scope: "User-directed CBB top-100 replacement batch for ranks 53, 63, 67, 76, 77, 79, 82, and 83.",
  method: [
    "Incoming players inherited the outgoing player's final projected BBPR to preserve the requested slot.",
    "Outgoing players were moved below the top-100 line and all ranks were recomputed from projected BBPR.",
    "Projection notes and confidence grades were updated for each touched player.",
  ],
  changes,
  targetRanks: ranked
    .filter((player) => targetNames.has(normalizeName(player.player)))
    .map((player) => ({
      rank: player.rank,
      player: player.player,
      team: player.currentTeam,
      projectedBbpr: player.projectedBbpr,
    })),
  oldRank50to100,
  newRank50to100: summarizeRankRange(players, 50, 100),
  top100Line: ranked.at(99)?.projectedBbpr,
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

for (const item of report.targetRanks) {
  console.log(`${item.rank ?? "null"}\t${item.player}\t${item.projectedBbpr ?? "null"}`);
}
console.log(`top100Line\t${report.top100Line}`);
