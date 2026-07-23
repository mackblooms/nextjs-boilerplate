import { promises as fs } from "fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "path";
import type {
  CbbPlayerProjection,
  CbbProjectionAuditPayload,
  CbbProjectionPayload,
  CbbResearchBatch,
  CbbResearchPayload,
  CbbResearchPlayer,
  CbbResearchPlayerWithState,
} from "@/lib/cbbPlayerProjections";
import { calibrateProjectedBbpr } from "@/lib/cbbProjectionCalibration";

const dataDir = path.join(process.cwd(), "data", "cbb");
const projectionsPath = path.join(dataDir, "player-projections.json");
const auditPath = path.join(dataDir, "projection-calibration-audit.json");
const transferSuggestionsPath = path.join(dataDir, "transfer-projection-suggestions.json");
const researchBatchPattern =
  /^(?:player|transfer|freshman|returning|returner|international)-research-batch-\d+\.json$/;
const execFileAsync = promisify(execFile);

function nearlyEqual(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 0.001;
}

function withResearchAnchor(player: CbbPlayerProjection, suggestion: CbbResearchPlayer) {
  return {
    ...player,
    historicalRating: player.historicalRating ?? suggestion.historicalRating,
  };
}

function isSuggestionApplied(player: CbbPlayerProjection | undefined, suggestion: CbbResearchPlayer) {
  if (!player) return false;
  const anchoredPlayer = withResearchAnchor(player, suggestion);
  const calibratedProjectedBbpr = calibrateProjectedBbpr(anchoredPlayer, suggestion.suggested);
  return (
    !player.needsReview &&
    player.projectionInputCompleteness === 100 &&
    nearlyEqual(player.historicalRating, anchoredPlayer.historicalRating) &&
    player.projectedStarter === suggestion.suggested.projectedStarter &&
    nearlyEqual(player.projectedRole, suggestion.suggested.projectedRole) &&
    nearlyEqual(player.opportunityChange, suggestion.suggested.opportunityChange) &&
    nearlyEqual(player.offensiveBurden, suggestion.suggested.offensiveBurden) &&
    nearlyEqual(player.opportunityScore, suggestion.suggested.opportunityScore) &&
    nearlyEqual(player.nbaProjectionScore, suggestion.suggested.nbaProjectionScore) &&
    nearlyEqual(player.upsideToolsScore, suggestion.suggested.upsideToolsScore) &&
    nearlyEqual(player.talentScore, suggestion.suggested.talentScore) &&
    nearlyEqual(player.projectionScore, suggestion.suggested.projectionScore) &&
    nearlyEqual(player.projectedBbpr, calibratedProjectedBbpr)
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

function numeric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rankPlayers(players: CbbPlayerProjection[]) {
  const ranked = [...players]
    .filter((player) => numeric(player.projectedBbpr) != null)
    .sort((left, right) => {
      const scoreDiff = (right.projectedBbpr ?? -1) - (left.projectedBbpr ?? -1);
      if (scoreDiff !== 0) return scoreDiff;
      const confidenceDiff = (numeric(right.confidenceScore) ?? -1) - (numeric(left.confidenceScore) ?? -1);
      if (confidenceDiff !== 0) return confidenceDiff;
      return left.player.localeCompare(right.player);
    });

  return new Map(ranked.map((player, index) => [player.id, index + 1]));
}

export async function readCbbProjections() {
  const raw = await fs.readFile(projectionsPath, "utf8");
  return JSON.parse(raw) as CbbProjectionPayload;
}

export async function readCbbProjectionAudit() {
  const raw = await fs.readFile(auditPath, "utf8");
  return JSON.parse(raw) as CbbProjectionAuditPayload;
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

async function writeCbbResearchBatch(fileName: string, batch: CbbResearchBatch) {
  await fs.writeFile(path.join(dataDir, fileName), `${JSON.stringify(batch, null, 2)}\n`, "utf8");
}

async function removeTransferSuggestion(sourceRow: number) {
  const raw = await fs.readFile(transferSuggestionsPath, "utf8").catch(() => null);
  if (!raw) return 0;

  const payload = JSON.parse(raw) as {
    summary?: Record<string, unknown>;
    suggestions?: Array<{ sourceRow?: number }>;
  };
  if (!Array.isArray(payload.suggestions)) return 0;

  const before = payload.suggestions.length;
  payload.suggestions = payload.suggestions.filter((suggestion) => suggestion.sourceRow !== sourceRow);
  const removed = before - payload.suggestions.length;

  if (removed > 0) {
    if (payload.summary && typeof payload.summary === "object") {
      for (const key of ["suggestionCount", "count", "totalSuggestions"]) {
        if (typeof payload.summary[key] === "number") {
          payload.summary[key] = payload.suggestions.length;
        }
      }
    }
    await fs.writeFile(transferSuggestionsPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  return removed;
}

async function refreshCbbProjectionAudit() {
  const scriptPath = path.join(process.cwd(), "scripts", "audit-cbb-projection-calibration.mjs");
  await execFileAsync(process.execPath, [scriptPath], { cwd: process.cwd() });
  return readCbbProjectionAudit();
}

export function buildCbbResearchPayload(
  batches: CbbResearchBatch[],
  projections: CbbProjectionPayload
): CbbResearchPayload {
  const playerByRow = new Map(projections.players.map((player) => [player.sourceRow, player]));

  const players: CbbResearchPlayerWithState[] = batches.flatMap((batch) =>
    batch.players.map((player) => {
      const current = playerByRow.get(player.sourceRow);
      const anchoredCurrent = current ? withResearchAnchor(current, player) : null;
      const suggested = current
        ? {
            ...player.suggested,
            projectedBbpr: calibrateProjectedBbpr(anchoredCurrent!, player.suggested),
          }
        : player.suggested;
      return {
        ...player,
        suggested,
        batchId: batch.batchId,
        applied: isSuggestionApplied(current, player),
        currentProjection: current
          ? {
              projectedStarter: current.projectedStarter,
              historicalRating: current.historicalRating,
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
    const anchoredPlayer = withResearchAnchor(player, suggestion);
    return {
      ...player,
      historicalRating: anchoredPlayer.historicalRating,
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
      projectedBbpr: calibrateProjectedBbpr(anchoredPlayer, suggestion.suggested),
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

export async function removeCbbDuplicatePlayerRow(sourceRow: number) {
  const projections = await readCbbProjections();
  const batchFiles = (await fs.readdir(dataDir)).filter((entry) => researchBatchPattern.test(entry)).sort();
  const batches = await Promise.all(
    batchFiles.map(async (fileName) => {
      const raw = await fs.readFile(path.join(dataDir, fileName), "utf8");
      return {
        fileName,
        batch: JSON.parse(raw) as CbbResearchBatch,
      };
    })
  );
  const removedPlayer = projections.players.find((player) => player.sourceRow === sourceRow);

  if (!removedPlayer) {
    const researchBatches = batches.map((entry) => entry.batch);
    return {
      removedPlayer: null,
      removedBatchRows: [],
      removedTransferSuggestions: 0,
      projections,
      research: buildCbbResearchPayload(researchBatches, projections),
      audit: await readCbbProjectionAudit(),
    };
  }

  const now = new Date().toISOString();
  const playersWithoutRow = projections.players.filter((player) => player.sourceRow !== sourceRow);
  const rankById = rankPlayers(playersWithoutRow);
  const players = playersWithoutRow.map((player) => ({
    ...player,
    rank: rankById.get(player.id) ?? null,
  }));
  const nextPayload: CbbProjectionPayload = {
    ...projections,
    generatedAt: now,
    summary: summarize(players),
    players,
  };

  await writeCbbProjections(nextPayload);

  const removedBatchRows: Array<{ batchId: string; fileName: string; removed: number; remaining: number }> = [];
  const nextBatches = await Promise.all(
    batches.map(async ({ fileName, batch }) => {
      const before = batch.players.length;
      const nextBatch = {
        ...batch,
        players: batch.players.filter((player) => player.sourceRow !== sourceRow),
      };
      const removed = before - nextBatch.players.length;
      if (removed > 0) {
        await writeCbbResearchBatch(fileName, nextBatch);
        removedBatchRows.push({
          batchId: batch.batchId,
          fileName,
          removed,
          remaining: nextBatch.players.length,
        });
      }
      return nextBatch;
    })
  );

  const removedTransferSuggestions = await removeTransferSuggestion(sourceRow);
  const audit = await refreshCbbProjectionAudit();

  return {
    removedPlayer,
    removedBatchRows,
    removedTransferSuggestions,
    projections: nextPayload,
    research: buildCbbResearchPayload(nextBatches, nextPayload),
    audit,
  };
}
