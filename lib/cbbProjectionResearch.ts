import { promises as fs } from "fs";
import path from "path";
import type {
  CbbPlayerProjection,
  CbbProjectionPayload,
  CbbResearchBatch,
  CbbResearchPayload,
  CbbResearchPlayer,
  CbbResearchPlayerWithState,
} from "@/lib/cbbPlayerProjections";

const dataDir = path.join(process.cwd(), "data", "cbb");
const projectionsPath = path.join(dataDir, "player-projections.json");
const researchBatchPattern =
  /^(?:player|transfer|freshman|returning|returner|international)-research-batch-\d+\.json$/;

function nearlyEqual(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 0.001;
}

function isSuggestionApplied(player: CbbPlayerProjection | undefined, suggestion: CbbResearchPlayer) {
  if (!player) return false;
  return (
    !player.needsReview &&
    player.projectionInputCompleteness === 100 &&
    player.projectedStarter === suggestion.suggested.projectedStarter &&
    nearlyEqual(player.projectedRole, suggestion.suggested.projectedRole) &&
    nearlyEqual(player.opportunityChange, suggestion.suggested.opportunityChange) &&
    nearlyEqual(player.offensiveBurden, suggestion.suggested.offensiveBurden) &&
    nearlyEqual(player.opportunityScore, suggestion.suggested.opportunityScore) &&
    nearlyEqual(player.nbaProjectionScore, suggestion.suggested.nbaProjectionScore) &&
    nearlyEqual(player.upsideToolsScore, suggestion.suggested.upsideToolsScore) &&
    nearlyEqual(player.talentScore, suggestion.suggested.talentScore) &&
    nearlyEqual(player.projectionScore, suggestion.suggested.projectionScore) &&
    nearlyEqual(player.projectedBbpr, suggestion.suggested.projectedBbpr)
  );
}

function summarize(players: CbbPlayerProjection[]) {
  const byType: Record<string, number> = {};
  const byClass: Record<string, number> = {};

  for (const player of players) {
    if (player.playerType) byType[player.playerType] = (byType[player.playerType] ?? 0) + 1;
    if (player.classYear) byClass[player.classYear] = (byClass[player.classYear] ?? 0) + 1;
  }

  return {
    playerCount: players.length,
    projectedCount: players.filter((player) => player.projectionInputCompleteness === 100).length,
    needsReviewCount: players.filter((player) => player.needsReview).length,
    byType,
    byClass,
  };
}

export async function readCbbProjections() {
  const raw = await fs.readFile(projectionsPath, "utf8");
  return JSON.parse(raw) as CbbProjectionPayload;
}

export async function writeCbbProjections(payload: CbbProjectionPayload) {
  await fs.writeFile(projectionsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function readCbbResearchBatches() {
  const entries = await fs.readdir(dataDir);
  const batchFiles = entries.filter((entry) => researchBatchPattern.test(entry)).sort();
  const batches = await Promise.all(
    batchFiles.map(async (file) => {
      const raw = await fs.readFile(path.join(dataDir, file), "utf8");
      return JSON.parse(raw) as CbbResearchBatch;
    })
  );

  return batches;
}

export function buildCbbResearchPayload(
  batches: CbbResearchBatch[],
  projections: CbbProjectionPayload
): CbbResearchPayload {
  const playerByRow = new Map(projections.players.map((player) => [player.sourceRow, player]));

  const players: CbbResearchPlayerWithState[] = batches.flatMap((batch) =>
    batch.players.map((player) => {
      const current = playerByRow.get(player.sourceRow);
      return {
        ...player,
        batchId: batch.batchId,
        applied: isSuggestionApplied(current, player),
        currentProjection: current
          ? {
              projectedStarter: current.projectedStarter,
              projectedRole: current.projectedRole,
              opportunityChange: current.opportunityChange,
              offensiveBurden: current.offensiveBurden,
              opportunityScore: current.opportunityScore,
              entryTalentGrade: current.entryTalentGrade,
              nbaProjectionScore: current.nbaProjectionScore,
              upsideToolsScore: current.upsideToolsScore,
              talentScore: current.talentScore,
              projectionScore: current.projectionScore,
              projectedBbpr: current.projectedBbpr,
              playerType: current.playerType,
              confidenceScore: current.confidenceScore,
              confidenceGrade: current.confidenceGrade,
              needsReview: current.needsReview,
              projectionInputCompleteness: current.projectionInputCompleteness,
              lastUpdated: current.lastUpdated,
            }
          : null,
      };
    })
  );

  const appliedCount = players.filter((player) => player.applied).length;

  return {
    generatedAt: new Date().toISOString(),
    batchCount: batches.length,
    playerCount: players.length,
    appliedCount,
    pendingCount: players.length - appliedCount,
    batches: batches.map((batch) => ({
      batchId: batch.batchId,
      createdAt: batch.createdAt,
      scope: batch.scope,
      playerCount: batch.players.length,
    })),
    players,
  };
}

export async function applyCbbResearchRows(sourceRows: number[]) {
  const uniqueRows = Array.from(new Set(sourceRows.filter((row) => Number.isInteger(row))));
  const [projections, batches] = await Promise.all([readCbbProjections(), readCbbResearchBatches()]);
  const suggestionByRow = new Map<number, CbbResearchPlayer>();

  for (const batch of batches) {
    for (const player of batch.players) {
      suggestionByRow.set(player.sourceRow, player);
    }
  }

  const now = new Date().toISOString();
  const appliedRows: number[] = [];
  const missingRows: number[] = [];
  const players = projections.players.map((player) => {
    if (!uniqueRows.includes(player.sourceRow)) return player;

    const suggestion = suggestionByRow.get(player.sourceRow);
    if (!suggestion) {
      missingRows.push(player.sourceRow);
      return player;
    }

    appliedRows.push(player.sourceRow);
    return {
      ...player,
      projectedStarter: suggestion.suggested.projectedStarter,
      projectedRole: suggestion.suggested.projectedRole,
      opportunityChange: suggestion.suggested.opportunityChange,
      offensiveBurden: suggestion.suggested.offensiveBurden,
      opportunityScore: suggestion.suggested.opportunityScore,
      entryTalentGrade: suggestion.suggested.entryTalentGrade ?? player.entryTalentGrade,
      nbaProjectionScore: suggestion.suggested.nbaProjectionScore,
      upsideToolsScore: suggestion.suggested.upsideToolsScore,
      talentScore: suggestion.suggested.talentScore,
      projectionScore: suggestion.suggested.projectionScore,
      projectedBbpr: suggestion.suggested.projectedBbpr,
      projectionInputCompleteness: 100,
      confidenceScore: suggestion.suggested.confidenceScore,
      confidenceGrade: suggestion.suggested.confidenceGrade,
      needsReview: false,
      projectionNotes: suggestion.researchSummary,
      lastUpdated: now,
    } satisfies CbbPlayerProjection;
  });

  const nextPayload: CbbProjectionPayload = {
    ...projections,
    generatedAt: now,
    summary: summarize(players),
    players,
  };

  await writeCbbProjections(nextPayload);

  return {
    appliedRows,
    missingRows,
    projections: nextPayload,
    research: buildCbbResearchPayload(batches, nextPayload),
  };
}
