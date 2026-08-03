import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data", "cbb");
const projection = JSON.parse(fs.readFileSync(path.join(dataDir, "player-projections.json"), "utf8")).players.find(
  (player) => player.player === "Jeremiah Wilkinson"
);

if (!projection) throw new Error("Jeremiah Wilkinson not found in player projections.");

const fields = [
  "projectedStarter",
  "projectedRole",
  "opportunityChange",
  "offensiveBurden",
  "opportunityScore",
  "nbaProjectionScore",
  "upsideToolsScore",
  "talentScore",
  "developmentScore",
  "projectionScore",
  "projectedBbpr",
  "confidenceScore",
  "confidenceGrade",
  "needsReview",
];

function updateSuggested(target) {
  target.historicalRating = projection.historicalRating;
  target.developmentScore = projection.developmentScore;
  target.researchSummary = projection.projectionNotes;
  target.suggested ??= {};
  for (const field of fields) target.suggested[field] = projection[field];
}

const batchPath = path.join(dataDir, "transfer-research-batch-003.json");
const batch = JSON.parse(fs.readFileSync(batchPath, "utf8"));
const batchPlayer = batch.players.find((player) => player.sourceRow === projection.sourceRow);
if (!batchPlayer) throw new Error("Jeremiah Wilkinson not found in transfer research batch.");
updateSuggested(batchPlayer);
batchPlayer.status = "researched_suggestion";
batchPlayer.teamContext.roleCap =
  "top-100 transfer starter/major-usage scorer; still below primary-star tier because Arkansas has multiple blue-chip usage threats";
batchPlayer.teamContext.starterEvidence =
  "direct projected-lineup evidence, SEC scoring production, and Arkansas need for proven perimeter offense";
fs.writeFileSync(batchPath, `${JSON.stringify(batch, null, 2)}\n`);

const suggestionsPath = path.join(dataDir, "transfer-projection-suggestions.json");
const suggestions = JSON.parse(fs.readFileSync(suggestionsPath, "utf8"));
const suggestion = suggestions.suggestions.find((player) => player.sourceRow === projection.sourceRow);
if (!suggestion) throw new Error("Jeremiah Wilkinson not found in transfer projection suggestions.");
suggestion.current.historicalRating = projection.historicalRating;
suggestion.current.developmentScore = projection.developmentScore;
suggestion.current.projectedBbpr = projection.projectedBbpr;
suggestion.current.needsReview = false;
for (const field of fields) suggestion.suggested[field] = projection[field];
suggestion.suggested.suggestionStatus = "researched";
suggestion.reasoning = [
  "synced to researched player-projection engine values after user-directed top-100 replacement",
  "Arkansas fit is driven by projected starting role, SEC-proven scoring, and reliable perimeter usage",
  "kept below primary-star tier because Arkansas still has multiple blue-chip freshmen and returning athletes competing for touches",
];
fs.writeFileSync(suggestionsPath, `${JSON.stringify(suggestions, null, 2)}\n`);

console.log("Synced Jeremiah Wilkinson transfer records.");
