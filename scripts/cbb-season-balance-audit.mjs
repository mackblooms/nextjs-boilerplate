// Search draft economics without changing win-percentage scoring or the live app.
import { readFileSync, writeFileSync } from 'node:fs';
import { enumerate } from './cbb-season-pricing-audit.mjs';
import { assignBands, strongestSquad } from './cbb-season-pricing-model.mjs';

const source = JSON.parse(readFileSync(new URL('../data/cbb-season/torvik-2027-projections.json', import.meta.url)));
const cutoffs = [.75, .625, .5, 0];
const teams = assignBands(source.teams, cutoffs);
const cache = new Map();
function optimize(shape) {
  const key = shape.counts.join(',');
  if (!cache.has(key)) cache.set(key, strongestSquad(teams, shape));
  return cache.get(key);
}
function evaluate(candidate, shapes = enumerate(candidate)) {
  const evaluated = shapes.map(optimize);
  const sizes = [...new Set(evaluated.map(s => s.size))].sort((a, b) => a - b);
  const frontier = sizes.map(size => evaluated.filter(s => s.size === size).sort((a, b) => b.winPercentage - a.winPercentage)[0]);
  return { ...candidate, legalBandCombinations: shapes.length, frontier,
    spread: Math.max(...frontier.map(s => s.winPercentage)) - Math.min(...frontier.map(s => s.winPercentage)),
    shapes: evaluated };
}

const baseline = evaluate({ name: 'Previous candidate', prices: [10, 8, 6, 4], min: [0, 0, 4, 3], max: [2, 5, 8, 6] });
let tested = 0;
const eligible = [];
for (let elite = 8; elite <= 12; elite++) {
  for (let contender = 6; contender < elite && contender <= 10; contender++) {
    for (let value = 4; value < contender && value <= 7; value++) {
      for (let longshot = 2; longshot < value && longshot <= 4; longshot++) {
        const prices = [elite, contender, value, longshot];
        const possible = enumerate({ prices, min: [0, 0, 3, 2], max: [3, 6, 10, 8] });
        for (const maxElite of [2, 3]) for (const maxContender of [4, 5, 6]) {
          for (const maxValue of [8, 10]) for (const maxLongshot of [6, 8]) {
            for (let minValue = 3; minValue <= 6; minValue++) for (let minLongshot = 2; minLongshot <= 6; minLongshot++) {
              tested++;
              const min = [0, 0, minValue, minLongshot];
              const max = [maxElite, maxContender, maxValue, maxLongshot];
              const shapes = possible.filter(s => s.counts.every((n, i) => n >= min[i] && n <= max[i]));
              if (shapes.length < 5 || shapes.some(s => s.size < 15 || s.size > 18)
                || ![15, 16, 17].every(size => shapes.some(s => s.size === size))) continue;
              eligible.push(evaluate({ prices, min, max }, shapes));
            }
          }
        }
      }
    }
  }
}
eligible.sort((a, b) => a.spread - b.spread || b.legalBandCombinations - a.legalBandCombinations);
// Keep enough compositions to avoid selecting solely for a narrow optimized spread.
const recommended = eligible.find(c => c.legalBandCombinations >= 10 && c.frontier.some(s => s.size === 18));
if (!recommended) throw new Error('No candidate met the review criteria');
recommended.name = 'Broader-choice rebalance candidate';
const narrowest = eligible[0];

// Deterministic forecast-error probes. Freeze bands, costs and each shape's original
// selected teams. Change one projected win into a loss (or vice versa) for every
// team in a single band. These are not schedule-consistent season simulations.
function stress(candidate) {
  return [0, 1, 2, 3].flatMap(band => [-1, 1].map(delta => {
    const changed = new Map(teams.map(t => {
      const wins = Math.max(0, Math.min(t.games, t.projectedWins + (t.bandIndex === band ? delta : 0)));
      return [t.team, { wins, games: t.games }];
    }));
    const evaluated = candidate.shapes.map(shape => {
      const wins = shape.teams.reduce((s, name) => s + changed.get(name).wins, 0);
      const games = shape.teams.reduce((s, name) => s + changed.get(name).games, 0);
      return { size: shape.size, winPercentage: wins / games };
    });
    const frontier = candidate.frontier.map(s => evaluated.filter(t => t.size === s.size).sort((a, b) => b.winPercentage - a.winPercentage)[0]);
    return { band, delta, frontier, spread: Math.max(...frontier.map(t => t.winPercentage)) - Math.min(...frontier.map(t => t.winPercentage)) };
  }));
}
const probes = { baseline: stress(baseline), recommended: stress(recommended) };
const result = {
  sourceSha256: source.sourceSha256, cutoffs,
  search: { tested, eligible: eligible.length, bounds: 'Elite price 8-12, Contender 6-10, Value 4-7, Long shot 2-4; strictly descending prices; min Value 3-6, Long shot 2-6; max Elite 2/3, Contender 4/5/6, Value 8/10, Long shot 6/8',
    eligibility: 'At least 5 band-count combinations; all squads 15-18 via band limits; sizes 15,16,17 all available',
    selection: 'Lowest nominal frontier spread among searched candidates with at least 10 band-count combinations and size 18 available' },
  baseline, recommended, narrowest,
  top20: eligible.slice(0, 20).map(c => Object.fromEntries(Object.entries(c).filter(([key]) => key !== 'shapes'))), probes,
  caveats: ['Selected on one projection snapshot; not out-of-sample validation', 'Integer projected record ratios, not outcome simulations', 'Stress probes are hypothetical band-wide forecast shifts, not likelihood estimates', 'No live pricing or rule changes', 'Not an exhaustive search over all possible pricing systems'],
};
writeFileSync(new URL('../data/cbb-season/torvik-2027-balance-audit.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');

const percent = n => (100 * n).toFixed(2) + '%';
const points = n => (100 * n).toFixed(2);
const names = ['Elite', 'Contender', 'Value', 'Long shot'];
const quote = x => `"${String(x).replaceAll('"', '""')}"`;
const csv = [['Team', 'Conference', 'Projected wins', 'Projected losses', 'Projected win percentage', 'Band', 'Candidate cost', 'Torvik rank', 'PDF page', 'Season']];
for (const t of [...teams].sort((a, b) => a.bandIndex - b.bandIndex || b.winPercentage - a.winPercentage || a.rank - b.rank)) {
  csv.push([t.team, t.conference, t.projectedWins, t.projectedLosses, t.winPercentage.toFixed(8), names[t.bandIndex], recommended.prices[t.bandIndex], t.rank, t.sourcePage, source.season]);
}
writeFileSync(new URL('../docs/cbb-season-balanced-pricing-board.csv', import.meta.url), '\uFEFF' + csv.map(row => row.map(quote).join(',')).join('\n') + '\n');

const report = [
  '# College basketball season balance review', '',
  'Status: proposed alternative for review. No published pricing, squad rules, scoring or website changed.', '',
  '## What was tested', '',
  `Searched ${tested.toLocaleString('en-US')} price/limit configurations using the supplied Torvik records; ${eligible.length.toLocaleString('en-US')} met the stated structural criteria.`,
  'Cutoffs remain .750 / .625 / .500. All candidates spend exactly 100, permit each team once, use pooled record percentages, and have no explicit total team limit.',
  'Elite prices stay at 12 or below. Search bounds, selection criteria, every selected squad, and deterministic stress probes are in the JSON audit.',
  'A combination means a count in each band, not an individual team roster. Thousands of individual rosters can share one combination.', '',
  '## Proposed alternative', '',
  '| Band | Previous price | Candidate price | Allowed purchases |',
  '| --- | ---: | ---: | --- |',
  ...names.map((name, i) => `| ${name} | ${baseline.prices[i]} | ${recommended.prices[i]} | ${recommended.min[i]}-${recommended.max[i]} |`),
  '', `The candidate offers ${recommended.legalBandCombinations} distinct band-count combinations, spanning 15-18 teams. The previous candidate offered ${baseline.legalBandCombinations}, spanning 15-17.`,
  'Long shots become cheaper but are required in greater numbers. Value teams become more expensive, making it harder to buy cheap depth alongside a small collection of favorites.',
  '', '## Strongest displayed projected record by size', '',
  '| Teams | Previous candidate | Proposed alternative | Alternative band counts (E / C / V / L) |',
  '| ---: | ---: | ---: | --- |',
  ...recommended.frontier.map(s => {
    const old = baseline.frontier.find(t => t.size === s.size);
    return `| ${s.size} | ${old ? percent(old.winPercentage) : 'Unavailable'} | ${percent(s.winPercentage)} | ${s.counts.join(' / ')} |`;
  }),
  '', `The previous 15-17 frontier spread was ${points(baseline.spread)} percentage points. The candidate's full 15-18 spread is ${points(recommended.spread)} points.`,
  'These are optimized ratios of displayed projections, not expected realized winning percentages or guarantees of equal chances.',
  '', '## All legal band-count combinations', '',
  '| Elite | Contender | Value | Long shot | Teams | Projected optimum |',
  '| ---: | ---: | ---: | ---: | ---: | ---: |',
  ...recommended.shapes.slice().sort((a, b) => a.size - b.size || b.winPercentage - a.winPercentage).map(s => `| ${s.counts.join(' | ')} | ${s.size} | ${percent(s.winPercentage)} |`),
  '', '## Sensitivity checks', '',
  'For each band separately, shift every team by one win in either direction at fixed games. Hold original selected rosters, prices and bands fixed, then compare the best original rosters by size. These eight hypothetical probes are not simulations of feasible game outcomes or confidence intervals.',
  '', '| Candidate | Smallest probe spread | Largest probe spread |',
  '| --- | ---: | ---: |',
  ...[['Previous', probes.baseline], ['Alternative', probes.recommended]].map(([name, list]) => `| ${name} | ${points(Math.min(...list.map(p => p.spread)))} pp | ${points(Math.max(...list.map(p => p.spread)))} pp |`),
  '', '## Tradeoffs and recommendation', '',
  `The narrowest nominal spread found was ${points(narrowest.spread)} points using ${narrowest.prices.join(' / ')} prices, but it offered only ${narrowest.legalBandCombinations} band-count combinations. The proposed alternative preserves more constructions and includes 18-team squads.`,
  'Carry this alternative into review rather than finalizing the previous candidate. It reduces the nominal size incentive while preserving low prices, compulsory underdogs and simple scoring. It does not eliminate the incentive or establish equal win probabilities.',
  'Five or more long-shot selections is a meaningful new restriction. Owners must be comfortable following several projected losing teams; total projected percentages decrease partly because stronger builds are constrained, not because everyone gains better teams.',
  'All within-band picks still have equal prices despite different projections. Upper-boundary bargains and concentration in the strongest projected teams remain. Pricing alone cannot make every possible squad equally strong.',
  'No historical preseason holdout or schedule-consistent simulation is available. Do not treat optimizing against this same snapshot or the stress probes as independent proof of fairness. Actual outcome variance and overlapping schedules can change contest win probabilities.',
  'Source capture date, current membership and inclusion of all non-D-I games remain unverified. Conference-tournament games count in the contest but are not separately modeled here.',
  '', 'Regenerate with `node scripts/cbb-season-balance-audit.mjs`.', '',
];
writeFileSync(new URL('../docs/cbb-season-balance-review.md', import.meta.url), report.join('\n'));
console.log(JSON.stringify({ tested, eligible: eligible.length, baseline: baseline.frontier, recommended: { prices: recommended.prices, min: recommended.min, max: recommended.max, combinations: recommended.legalBandCombinations, frontier: recommended.frontier, spread: recommended.spread }, probeSpreads: Object.fromEntries(Object.entries(probes).map(([name, list]) => [name, list.map(p => p.spread)])) }, null, 2));
