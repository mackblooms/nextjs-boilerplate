// Planning only: exhaustively enumerate band counts, not individual team selections.
// No invented team projections or claims of competitive balance.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const candidates = [
  { name: 'Original draft', prices: [12, 8, 5, 4], min: [0, 0, 4, 3], max: [3, 5, 20, 25] },
  { name: 'Original prices with tighter band limits', prices: [12, 8, 5, 4], min: [0, 0, 4, 3], max: [2, 5, 8, 6] },
  { name: 'Even prices candidate', prices: [10, 8, 6, 4], min: [0, 0, 4, 3], max: [2, 5, 8, 6] },
];

export function enumerate(candidate, counts = [], spent = 0) {
  const band = counts.length;
  if (band === candidate.prices.length) {
    return spent === 100 ? [{ counts, size: counts.reduce((sum, n) => sum + n, 0) }] : [];
  }
  const result = [];
  for (let n = candidate.min[band]; n <= candidate.max[band]; n++) {
    const next = spent + n * candidate.prices[band];
    if (next > 100) break;
    result.push(...enumerate(candidate, [...counts, n], next));
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 for (const candidate of candidates) {
  const shapes = enumerate(candidate);
  if (!shapes.length) throw new Error(`No legal squads: ${candidate.name}`);
  const histogram = {};
  for (const shape of shapes) histogram[shape.size] = (histogram[shape.size] ?? 0) + 1;
  console.log(JSON.stringify({
    candidate: candidate.name,
    prices: candidate.prices,
    minimums: candidate.min,
    maximums: candidate.max,
    legalBandCombinations: shapes.length,
    sizeRange: [Math.min(...shapes.map(s => s.size)), Math.max(...shapes.map(s => s.size))],
    combinationsBySize: histogram,
    ...(process.argv.includes('--details') ? { shapes } : {}),
  }, null, 2));
 }
}
