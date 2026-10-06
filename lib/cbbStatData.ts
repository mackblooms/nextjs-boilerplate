import { promises as fs } from 'node:fs';
import path from 'node:path';
import { cache } from 'react';
import { readCbbProjections } from './cbbProjectionResearch';
import { projectCbbStats, type StatDataset } from './cbbStatProjection';

export const readCbbProfileData = cache(async () => {
  const [rankings, raw] = await Promise.all([
    readCbbProjections(), fs.readFile(path.join(process.cwd(), 'data/cbb/stat-baselines.json'), 'utf8'),
  ]);
  const stats = JSON.parse(raw) as StatDataset;
  if (stats.season !== rankings.model.historicalDataSeason) throw new Error('Historical stats season does not match the rankings.');
  const score = (p: typeof rankings.players[number]) => p.projectedBbpr ?? p.historicalRating ?? p.historicalBbpr ?? p.starScore ?? p.entryTalentGrade;
  const players = [...rankings.players].sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1) || (b.confidenceScore ?? -1) - (a.confidenceScore ?? -1) || a.player.localeCompare(b.player));
  return { rankings, stats, players };
});

export async function readCbbPlayerProfile(id: string) {
  const { rankings, stats, players } = await readCbbProfileData();
  const index = players.findIndex(p => p.id === id);
  if (index === -1) return null;
  const player = players[index];
  return { player, rank: index + 1, season: rankings.model.rankingSeason, stats, projection: projectCbbStats(player, stats.records) };
}
