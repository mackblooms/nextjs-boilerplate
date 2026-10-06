import fs from 'node:fs/promises';
import XLSX from 'xlsx';

// Positional export documented by sportsdataverse/hoopR R/torvik_player_stats.R.
const year = 2026;
const sourceUrl = `https://barttorvik.com/getadvstats.php?year=${year}&csv=1`;
const input = process.argv[2];
const csv = input ? await fs.readFile(input, 'utf8') : await fetch(sourceUrl).then(async r => {
  if (!r.ok) throw new Error(`Stats download failed: ${r.status}`);
  return r.text();
});
const book = XLSX.read(csv, { type: 'string', raw: true });
const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' });
const records = [];
const rejected = [];
for (const row of rows) {
  const n = i => row[i] === '' ? NaN : Number(row[i]);
  const games = n(3);
  const points = n(63);
  const madePoints = n(13) + 2 * n(16) + 3 * n(19);
  const record = {
    sourceId: String(row[32]), player: String(row[0]), team: String(row[1]),
    classYear: String(row[25]), position: String(row[64]), games,
    minutes: n(54), rebounds: n(59), assists: n(60), steals: n(61), blocks: n(62),
    // AST/TO is provided, but raw turnovers are not. Keep this explicitly estimated.
    turnovers: n(35) > 0 ? n(60) / n(35) : null,
    points, twoMade: n(16) / games, twoAttempts: n(17) / games,
    threeMade: n(19) / games, threeAttempts: n(20) / games,
    ftMade: n(13) / games, ftAttempts: n(14) / games,
  };
  const numbers = Object.values(record).filter(v => typeof v === 'number');
  const inconsistent = Math.abs(madePoints / games - points) > 0.15;
  if (row.length !== 67 || n(31) !== year || games <= 0 || record.minutes <= 0 ||
      numbers.some(v => !Number.isFinite(v) || v < 0) || inconsistent ||
      record.twoMade > record.twoAttempts || record.threeMade > record.threeAttempts || record.ftMade > record.ftAttempts) {
    rejected.push({ player: row[0], team: row[1], reason: inconsistent ? 'shooting totals disagree with per-game points' : 'invalid or incomplete row' });
    continue;
  }
  records.push(record);
}
if (records.length < 1000) throw new Error(`Unexpected source format: only ${records.length} valid records. Existing data was not changed.`);
const payload = { season: '2025-26', source: 'Bart Torvik', sourceUrl, fetchedAt: new Date().toISOString(), records };
await fs.writeFile('data/cbb/stat-baselines.json', `${JSON.stringify(payload)}\n`);
await fs.writeFile('data/cbb/stat-import-audit.json', `${JSON.stringify({ sourceUrl, accepted: records.length, rejected }, null, 2)}\n`);
console.log(JSON.stringify({ accepted: records.length, rejected: rejected.length }));
