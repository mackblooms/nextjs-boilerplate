import fs from 'node:fs/promises';
import { projectCbbStats } from '../lib/cbbStatProjection.ts';

const rankings = JSON.parse(await fs.readFile('data/cbb/player-projections.json', 'utf8'));
const stats = JSON.parse(await fs.readFile('data/cbb/stat-baselines.json', 'utf8'));
const verified = JSON.parse(await fs.readFile('data/cbb/verified-stat-baselines.json', 'utf8'));
const score = p => p.projectedBbpr ?? p.historicalRating ?? p.historicalBbpr ?? p.starScore ?? p.entryTalentGrade ?? -1;
const top100 = [...rankings.players].sort((a, b) => score(b) - score(a) || (b.confidenceScore ?? -1) - (a.confidenceScore ?? -1) || a.player.localeCompare(b.player)).slice(0, 100);
const missingTop100 = top100.filter(p => !projectCbbStats(p, stats.records).projected).map(p => p.player);
const counts = {}, unavailableReasons = {}, examples = {};
for (const player of rankings.players) {
  const result = projectCbbStats(player, stats.records);
  counts[result.status] = (counts[result.status] ?? 0) + 1;
  examples[result.status] ??= { id: player.id, name: player.player };
  if (!result.projected) unavailableReasons[result.reason] = (unavailableReasons[result.reason] ?? 0) + 1;
}
console.log(JSON.stringify({ baselineRecords: stats.records.length, counts, missingTop100, unavailableReasons, examples }, null, 2));
if (missingTop100.length) process.exitCode = 1;

// Optional smoke check against an already running application.
const origin = process.argv[2];
if (origin) {
  const cases = [
    ['/cbb/players', 'Find a player or team'],
    ...Object.values(examples).map(p => [`/cbb/players/${encodeURIComponent(p.id)}`, 'Ranking breakdown']),
    ...[...verified.links, ...verified.officialTotals].map(p => [`/cbb/players/${encodeURIComponent(p.playerId)}`, 'Season comparison']),
    ['/cbb/players/nonexistent-player', 'Player not found'],
  ];
  for (const [pathname, expected] of cases) {
    const response = await fetch(new URL(pathname, origin), { signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    if ((!response.ok && response.status !== 404) || !html.includes(expected)) throw new Error(`Page smoke check failed: ${pathname} (${response.status})`);
    console.log(`${response.status} ${pathname}: expected content rendered`);
  }
}
