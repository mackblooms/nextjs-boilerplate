import fs from 'node:fs/promises';
import { projectCbbStats } from '../lib/cbbStatProjection.ts';

const rankings = JSON.parse(await fs.readFile('data/cbb/player-projections.json', 'utf8'));
const stats = JSON.parse(await fs.readFile('data/cbb/stat-baselines.json', 'utf8'));
const counts = {}, unavailableReasons = {}, examples = {};
for (const player of rankings.players) {
  const result = projectCbbStats(player, stats.records);
  counts[result.status] = (counts[result.status] ?? 0) + 1;
  examples[result.status] ??= { id: player.id, name: player.player };
  if (!result.projected) unavailableReasons[result.reason] = (unavailableReasons[result.reason] ?? 0) + 1;
}
console.log(JSON.stringify({ baselineRecords: stats.records.length, counts, unavailableReasons, examples }, null, 2));

// Optional smoke check against an already running application.
const origin = process.argv[2];
if (origin) {
  const cases = [
    ['/cbb/players', 'Find a player or team'],
    ...Object.values(examples).map(p => [`/cbb/players/${encodeURIComponent(p.id)}`, 'Ranking breakdown']),
    ['/cbb/players/nonexistent-player', 'Player not found'],
  ];
  for (const [pathname, expected] of cases) {
    const response = await fetch(new URL(pathname, origin), { signal: AbortSignal.timeout(30000) });
    const html = await response.text();
    if ((!response.ok && response.status !== 404) || !html.includes(expected)) throw new Error(`Page smoke check failed: ${pathname} (${response.status})`);
    console.log(`${response.status} ${pathname}: expected content rendered`);
  }
}
