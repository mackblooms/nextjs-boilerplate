import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data", "cbb");
const tolerance = 0.011;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of fs.readdirSync(dataDir).filter((name) => name.endsWith(".json"))) {
  readJson(path.join(dataDir, file));
}

const data = readJson(path.join(dataDir, "player-projections.json"));
const players = data.players;
const byName = new Map(players.map((player) => [player.player, player]));
const targets = [
  "Jeremiah Wilkinson",
  "Nikola Kusturica",
  "Billy Richmond III",
  "Uriah Tenette",
  "Desmond Roberts",
  "Miikka Muurinen",
];

for (const name of targets) assert(byName.has(name), `${name} missing from projections`);

for (const name of targets) {
  const player = byName.get(name);
  if (numeric(player.projectedBbpr) == null) continue;

  const opportunity = round(
    player.projectedRole * 0.5 + player.opportunityChange * 0.3 + player.offensiveBurden * 0.2,
    2
  );
  assert(Math.abs(opportunity - player.opportunityScore) <= tolerance, `${name} opportunityScore mismatch`);

  const talent =
    player.playerType === "Freshman" || player.playerType === "International"
      ? round(
          player.entryTalentGrade * 0.4 +
            player.nbaProjectionScore * 0.35 +
            player.upsideToolsScore * 0.25,
          2
        )
      : round(player.nbaProjectionScore * 0.6 + player.upsideToolsScore * 0.4, 2);
  assert(Math.abs(talent - player.talentScore) <= tolerance, `${name} talentScore mismatch`);

  const projection = round(player.opportunityScore * 0.45 + player.talentScore * 0.35 + player.developmentScore * 0.2);
  assert(Math.abs(projection - player.projectionScore) <= tolerance, `${name} projectionScore mismatch`);
}

assert(byName.get("Jeremiah Wilkinson").rank < 80, "Jeremiah Wilkinson did not land above the #80 line");
assert(byName.get("Nikola Kusturica").rank < 80, "Nikola Kusturica did not land above the #80 line");
assert(byName.get("Billy Richmond III").rank >= 70 && byName.get("Billy Richmond III").rank <= 79, "Billy Richmond III is not in the 70s");
assert(byName.get("Uriah Tenette").rank > 100, "Uriah Tenette is still in the top 100");
assert(byName.get("Miikka Muurinen").rank > 100, "Miikka Muurinen is still in the top 100");
assert(byName.get("Desmond Roberts").rank == null, "Desmond Roberts is still ranked");
assert(byName.get("Desmond Roberts").projectedBbpr == null, "Desmond Roberts still has a projected BBPR");

const ranks = players
  .filter((player) => numeric(player.projectedBbpr) != null)
  .map((player) => player.rank)
  .sort((left, right) => left - right);
for (let index = 0; index < ranks.length; index += 1) {
  assert(ranks[index] === index + 1, `rank sequence gap at ${index + 1}`);
}

const report = readJson(path.join(dataDir, "player-top100-replacements-2026-08-03.json"));
assert(report.rank80to100Unchanged === true, "rank 80-100 band changed");

console.log(`Parsed ${fs.readdirSync(dataDir).filter((name) => name.endsWith(".json")).length} JSON files.`);
console.log("Formula sanity passed for requested replacement players.");
console.log("Rank 80-100 band unchanged.");
