import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("data/cbb/player-projections.json", "utf8"));
const names = new Set([
  "Uriah Tenette",
  "Jeremiah Wilkinson",
  "Desmond Roberts",
  "Nikola Kusturica",
  "Miikka Muurinen",
  "Billy Richmond III",
]);

for (const player of data.players.filter((item) => names.has(item.player))) {
  console.log(JSON.stringify(player, null, 2));
}

console.log("--- ranks 35-105");
for (const player of data.players
  .filter((item) => item.projectedBbpr != null)
  .sort((a, b) => b.projectedBbpr - a.projectedBbpr)
  .slice(34, 105)) {
  console.log(`${player.rank}\t${player.player}\t${player.currentTeam}\t${player.playerType}\t${player.projectedBbpr}`);
}
