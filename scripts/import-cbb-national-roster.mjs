import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DEFAULT_WORKBOOK = "C:\\Personal\\bracketball\\player rankings\\all d1 players.xlsx";
const DEFAULT_PROJECTIONS = path.join("data", "cbb", "player-projections.json");
const DEFAULT_ROSTER_OUTPUT = path.join("data", "cbb", "all-d1-players.json");
const DEFAULT_SUMMARY_OUTPUT = path.join("data", "cbb", "all-d1-player-import-summary.json");

function readArg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || text === "-") return null;
  return text;
}

function cleanNumber(value) {
  if (value == null || value === "" || value === "-") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(4)) : null;
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value) {
  return normalizeKey(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

function makeMatchKeys(player) {
  const name = normalizeKey(player.player);
  const team = normalizeKey(player.currentTeam);
  const classYear = normalizeKey(player.classYear);
  return {
    name,
    nameTeam: `${name}::${team}`,
    nameTeamClass: `${name}::${team}::${classYear}`,
  };
}

function heightToInches(value) {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  return Number(match[1]) * 12 + Number(match[2]);
}

function inferPlayerType(row) {
  if (row.classYear !== "Fr") return "Returning";

  const hometown = cleanText(row.hometown) ?? "";
  const school = cleanText(row.highSchool) ?? "";
  const hasUsState = /\([A-Z]{2}\)/.test(hometown);
  const internationalSignals = [
    !hasUsState && hometown.length > 0,
    /^N\/A$/i.test(school),
    /academy africa|basket|real madrid|mega|barcelona|paris|asvel|olympia|partizan|fiba/i.test(school),
  ];

  return internationalSignals.filter(Boolean).length >= 2 ? "International" : "Freshman";
}

function developmentScoreForClass(classYear) {
  if (classYear === "Fr") return 100;
  if (classYear === "So") return 80;
  if (classYear === "Jr") return 60;
  return 40;
}

function confidenceGrade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B+";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

function makePlayerId(row, fallback) {
  const base = [
    slugify(row.player || `national-player-${fallback}`),
    slugify(row.currentTeam || "team-tbd"),
    slugify(row.classYear || "class-tbd"),
  ]
    .filter(Boolean)
    .join("__");
  return base || `national-player-${fallback}`;
}

function parseRoster(workbookPath) {
  const workbook = XLSX.readFile(workbookPath, {
    cellDates: false,
    cellFormula: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets.");

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: null,
    header: 1,
  });

  return rows
    .map((row, index) => {
      const player = cleanText(row[0]);
      const currentTeam = cleanText(row[4]);
      if (!player || !currentTeam) return null;

      const parsed = {
        nationalRow: index + 1,
        player,
        position: cleanText(row[1]),
        height: cleanText(row[2]),
        heightInches: heightToInches(row[2]),
        weight: cleanNumber(row[3]),
        currentTeam,
        classYear: cleanText(row[5]),
        sourcePlayerCode: cleanText(row[6]),
        hometown: cleanText(row[7]),
        highSchool: cleanText(row[8]),
      };

      return {
        ...parsed,
        playerType: inferPlayerType(parsed),
        matchKeys: makeMatchKeys(parsed),
      };
    })
    .filter(Boolean);
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

function buildExistingIndexes(players) {
  const byNameTeamClass = new Map();
  const byNameTeam = new Map();
  const byName = new Map();

  for (const player of players) {
    const keys = makeMatchKeys(player);
    byNameTeamClass.set(keys.nameTeamClass, player);
    byNameTeam.set(keys.nameTeam, player);
    const existing = byName.get(keys.name);
    if (!existing) byName.set(keys.name, [player]);
    else existing.push(player);
  }

  return { byNameTeamClass, byNameTeam, byName };
}

function findExistingPlayer(rosterPlayer, indexes) {
  const keys = rosterPlayer.matchKeys;
  const exact = indexes.byNameTeamClass.get(keys.nameTeamClass);
  if (exact) return { player: exact, matchType: "name_team_class" };

  const teamMatch = indexes.byNameTeam.get(keys.nameTeam);
  if (teamMatch) return { player: teamMatch, matchType: "name_team" };

  const nameMatches = indexes.byName.get(keys.name) ?? [];
  if (nameMatches.length === 1) return { player: nameMatches[0], matchType: "unique_name" };

  return null;
}

function makeProjectionRow(rosterPlayer, sourceRow, existingIds) {
  let id = makePlayerId(rosterPlayer, sourceRow);
  if (existingIds.has(id)) id = `${id}__national-${sourceRow}`;
  existingIds.add(id);

  const baseConfidence = rosterPlayer.classYear === "Fr" ? 45 : 55;
  const playerType = rosterPlayer.playerType;

  return {
    id,
    sourceRow,
    rank: null,
    player: rosterPlayer.player,
    currentTeam: rosterPlayer.currentTeam,
    previousTeam: null,
    position: rosterPlayer.position,
    classYear: rosterPlayer.classYear,
    playerType,
    heightInches: rosterPlayer.heightInches,
    age: null,
    recruitingRank: null,
    recruitingTier: null,
    historicalBbpr: null,
    starScore: null,
    difficulty: null,
    historicalRating: null,
    projectedStarter: null,
    projectedRole: null,
    opportunityChange: null,
    offensiveBurden: null,
    opportunityScore: null,
    entryTalentGrade: null,
    nbaProjectionScore: null,
    upsideToolsScore: null,
    talentScore: null,
    developmentScore: developmentScoreForClass(rosterPlayer.classYear),
    projectionScore: null,
    projectedBbpr: null,
    projectionInputCompleteness: 0,
    baseConfidence,
    confidenceScore: baseConfidence,
    confidenceGrade: confidenceGrade(baseConfidence),
    needsReview: true,
    projectionNotes: `Imported from all D1 players workbook row ${rosterPlayer.nationalRow}; role/projection research pending.`,
    lastUpdated: null,
  };
}

const workbookPath = path.resolve(readArg("--input", DEFAULT_WORKBOOK));
const projectionsPath = path.resolve(readArg("--projections", DEFAULT_PROJECTIONS));
const rosterOutputPath = path.resolve(readArg("--roster-output", DEFAULT_ROSTER_OUTPUT));
const summaryOutputPath = path.resolve(readArg("--summary-output", DEFAULT_SUMMARY_OUTPUT));
const dryRun = hasFlag("--dry-run");

if (!fs.existsSync(workbookPath)) throw new Error(`Workbook not found: ${workbookPath}`);
if (!fs.existsSync(projectionsPath)) throw new Error(`Projection file not found: ${projectionsPath}`);

const roster = parseRoster(workbookPath);
const payload = JSON.parse(fs.readFileSync(projectionsPath, "utf8"));
const indexes = buildExistingIndexes(payload.players);
const existingIds = new Set(payload.players.map((player) => player.id));
let nextSourceRow = Math.max(...payload.players.map((player) => player.sourceRow ?? 0), 0) + 1;

const matched = [];
const added = [];

for (const rosterPlayer of roster) {
  const match = findExistingPlayer(rosterPlayer, indexes);
  if (match) {
    matched.push({
      nationalRow: rosterPlayer.nationalRow,
      player: rosterPlayer.player,
      currentTeam: rosterPlayer.currentTeam,
      matchedSourceRow: match.player.sourceRow,
      matchedPlayer: match.player.player,
      matchedTeam: match.player.currentTeam,
      matchType: match.matchType,
      alreadyProjected: match.player.projectedBbpr != null,
      alreadyResearched: match.player.projectionInputCompleteness === 100 || !match.player.needsReview,
    });
    continue;
  }

  const projectionRow = makeProjectionRow(rosterPlayer, nextSourceRow, existingIds);
  nextSourceRow += 1;
  added.push({
    nationalRow: rosterPlayer.nationalRow,
    sourceRow: projectionRow.sourceRow,
    player: projectionRow.player,
    currentTeam: projectionRow.currentTeam,
    classYear: projectionRow.classYear,
    playerType: projectionRow.playerType,
  });
  payload.players.push(projectionRow);
}

const now = new Date().toISOString();
payload.generatedAt = now;
payload.sourceWorkbook = `${payload.sourceWorkbook}; ${path.basename(workbookPath)}`;
payload.summary = summarize(payload.players);

const rosterOutput = {
  generatedAt: now,
  sourceWorkbook: path.basename(workbookPath),
  sheetPlayerCount: roster.length,
  players: roster,
};

const summary = {
  generatedAt: now,
  dryRun,
  sourceWorkbook: path.basename(workbookPath),
  rosterCount: roster.length,
  existingProjectionCountBefore: payload.players.length - added.length,
  existingMatchedCount: matched.length,
  addedCount: added.length,
  projectedMatchesSkipped: matched.filter((player) => player.alreadyProjected).length,
  researchedMatchesSkipped: matched.filter((player) => player.alreadyResearched).length,
  projectionCountAfter: payload.players.length,
  byAddedType: added.reduce((acc, player) => {
    acc[player.playerType] = (acc[player.playerType] ?? 0) + 1;
    return acc;
  }, {}),
  added,
  matched,
};

if (!dryRun) {
  fs.mkdirSync(path.dirname(rosterOutputPath), { recursive: true });
  fs.writeFileSync(rosterOutputPath, `${JSON.stringify(rosterOutput, null, 2)}\n`);
  fs.writeFileSync(summaryOutputPath, `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(projectionsPath, `${JSON.stringify(payload, null, 2)}\n`);
}

console.log(
  JSON.stringify(
    {
      dryRun,
      rosterCount: summary.rosterCount,
      matched: summary.existingMatchedCount,
      added: summary.addedCount,
      projectedMatchesSkipped: summary.projectedMatchesSkipped,
      researchedMatchesSkipped: summary.researchedMatchesSkipped,
      projectionCountAfter: summary.projectionCountAfter,
      byAddedType: summary.byAddedType,
    },
    null,
    2
  )
);
