import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DEFAULT_WORKBOOK =
  "C:\\Personal\\bracketball\\player rankings\\bracketball_player_rating_26-27.xlsx";
const DEFAULT_OUTPUT = path.join("data", "cbb", "player-projections.json");

const FIELD_MAP = [
  ["player", "Player"],
  ["currentTeam", "Current Team"],
  ["previousTeam", "Previous Team"],
  ["position", "Position"],
  ["classYear", "Class"],
  ["playerType", "Player Type"],
  ["heightInches", "Height"],
  ["age", "Age"],
  ["recruitingRank", "Recruiting Rank"],
  ["recruitingTier", "Recruiting Tier"],
  ["historicalBbpr", "Historical bbpr"],
  ["starScore", "star score"],
  ["difficulty", "difficulty"],
  ["historicalRating", "historical rating"],
  ["projectedStarter", "Projected Starter"],
  ["projectedRole", "Projected Role"],
  ["opportunityChange", "Opportunity Change"],
  ["offensiveBurden", "Offensive Burden"],
  ["opportunityScore", "Opportunity Score"],
  ["entryTalentGrade", "Entry Talent Grade"],
  ["nbaProjectionScore", "NBA Projection Score"],
  ["upsideToolsScore", "Upside/Tools Score"],
  ["talentScore", "Talent Score"],
  ["developmentScore", "Development Score"],
  ["projectionScore", "Projection Score"],
  ["projectedBbpr", "Projected bbpr"],
  ["projectionInputCompleteness", "Projection Input Completeness"],
  ["baseConfidence", "Base Confidence"],
  ["confidenceScore", "Confidence Score"],
  ["confidenceGrade", "Confidence Grade"],
  ["needsReview", "Needs Review"],
  ["projectionNotes", "Projection Notes"],
  ["lastUpdated", "Last Updated"],
];

const NUMBER_FIELDS = new Set([
  "heightInches",
  "age",
  "recruitingRank",
  "historicalBbpr",
  "starScore",
  "difficulty",
  "historicalRating",
  "projectedRole",
  "opportunityChange",
  "offensiveBurden",
  "opportunityScore",
  "entryTalentGrade",
  "nbaProjectionScore",
  "upsideToolsScore",
  "talentScore",
  "developmentScore",
  "projectionScore",
  "projectedBbpr",
  "projectionInputCompleteness",
  "baseConfidence",
  "confidenceScore",
]);

function readArg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value)
    .replace(/â€™/g, "'")
    .replace(/â€œ|â€/g, '"')
    .replace(/â€“|â€”/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

function cleanNumber(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number(numeric.toFixed(4));
}

function excelDateToIso(value) {
  const numeric = cleanNumber(value);
  if (numeric == null) return cleanText(value);
  const parsed = XLSX.SSF.parse_date_code(numeric);
  if (!parsed) return String(value);
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function normalizeValue(key, value) {
  if (key === "lastUpdated") return excelDateToIso(value);
  if (NUMBER_FIELDS.has(key)) return cleanNumber(value);
  if (key === "needsReview") {
    const text = cleanText(value);
    if (!text) return false;
    return text.toLowerCase() === "yes" || text.toLowerCase() === "true";
  }
  if (value === 0) return null;
  return cleanText(value);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makePlayerId(row, index) {
  return [
    slugify(row.player ?? `player-${index + 1}`),
    slugify(row.currentTeam ?? "team-tbd"),
    row.classYear ? slugify(row.classYear) : "class-tbd",
  ].join("__");
}

function getSheet(workbook, name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(`Missing required sheet: ${name}`);
  }
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function parsePlayerRows(workbook) {
  const rows = getSheet(workbook, "player database");
  return rows
    .map((rawRow, index) => {
      const row = {};
      for (const [key, header] of FIELD_MAP) {
        row[key] = normalizeValue(key, rawRow[header]);
      }

      if (!row.player) return null;

      return {
        id: makePlayerId(row, index),
        rank: null,
        ...row,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const left = a.projectedBbpr ?? Number.NEGATIVE_INFINITY;
      const right = b.projectedBbpr ?? Number.NEGATIVE_INFINITY;
      if (right !== left) return right - left;
      return (a.player ?? "").localeCompare(b.player ?? "");
    })
    .map((row, index) => ({
      ...row,
      rank: row.projectedBbpr == null ? null : index + 1,
    }));
}

function parseLegend(workbook) {
  const sheet = workbook.Sheets.legend;
  if (!sheet) {
    throw new Error("Missing required sheet: legend");
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, header: 1 });
  const metadata = {};
  const notes = [];
  const historicalWeights = {};

  rows.forEach((row, index) => {
    const leftKey = cleanText(row[0]);
    const leftValue = cleanText(row[1]);
    if (leftKey && leftValue && index < 15) {
      metadata[slugify(leftKey).replace(/-/g, "_")] = leftValue;
    }

    const component = cleanText(row[13]);
    const weight = cleanNumber(row[14]);
    if (component && weight != null && component !== "Component") {
      historicalWeights[component] = weight;
    }

    const note = cleanText(row[18]);
    if (note) notes.push(note);
  });

  return { metadata, notes, historicalWeights };
}

function summarize(players) {
  const byType = {};
  const byClass = {};
  let projectedCount = 0;
  let needsReviewCount = 0;

  for (const player of players) {
    if (player.playerType) byType[player.playerType] = (byType[player.playerType] ?? 0) + 1;
    if (player.classYear) byClass[player.classYear] = (byClass[player.classYear] ?? 0) + 1;
    if (player.projectedBbpr != null) projectedCount += 1;
    if (player.needsReview) needsReviewCount += 1;
  }

  return {
    playerCount: players.length,
    projectedCount,
    needsReviewCount,
    byType,
    byClass,
  };
}

const workbookPath = path.resolve(readArg("--input", DEFAULT_WORKBOOK));
const outputPath = path.resolve(readArg("--output", DEFAULT_OUTPUT));

if (!fs.existsSync(workbookPath)) {
  throw new Error(`Workbook not found: ${workbookPath}`);
}

const workbook = XLSX.readFile(workbookPath, {
  cellDates: false,
  cellFormula: false,
});

const players = parsePlayerRows(workbook);
const legend = parseLegend(workbook);
const generatedAt = new Date().toISOString();

const payload = {
  generatedAt,
  sourceWorkbook: path.basename(workbookPath),
  model: {
    version: legend.metadata.model_version ?? null,
    rankingSeason: legend.metadata.ranking_season ?? null,
    historicalDataSeason: legend.metadata.historical_data_season ?? null,
    historicalDataSources: legend.metadata.historical_data_sources ?? null,
    purpose: legend.metadata.model_purpose ?? null,
    historicalMetric: legend.metadata.historical_metric ?? null,
    projectionMetric: legend.metadata.projection_metric ?? null,
    finalMetric: legend.metadata.final_metric ?? null,
    historicalPlayerBlend: legend.metadata.historical_player_blend ?? null,
    newcomerBlend: legend.metadata.newcomer_blend ?? null,
    historicalWeights: legend.historicalWeights,
    notes: legend.notes,
  },
  summary: summarize(players),
  players,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

console.log(
  `Imported ${payload.summary.playerCount} players (${payload.summary.projectedCount} projected, ${payload.summary.needsReviewCount} needing review) to ${outputPath}`
);
