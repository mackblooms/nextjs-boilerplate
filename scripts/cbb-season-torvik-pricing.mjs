// Offline planning artifacts only. Reads the reviewed PDF transcription, never live data.
import { readFileSync, writeFileSync } from 'node:fs';
import { candidates, enumerate } from './cbb-season-pricing-audit.mjs';
import { assignBands, strongestSquad } from './cbb-season-pricing-model.mjs';

const source = JSON.parse(readFileSync(new URL('../data/cbb-season/torvik-2027-projections.json', import.meta.url)));
const names = ['Elite', 'Contender', 'Value', 'Long shot'];
const boundaries = [
  { name: 'Original cutoffs', minimums: [.8, .65, .5, 0] },
  { name: 'Broader cutoffs', minimums: [.75, .625, .5, 0] },
];

if (source.season !== '2026-27' || source.teams.length !== 365) throw new Error('Unexpected source season or row count');
const seen = new Set();
for (const [index, team] of source.teams.entries()) {
  if (team.rank !== index + 1 || !team.team || !team.conference || seen.has(team.team)
    || !Number.isInteger(team.projectedWins) || !Number.isInteger(team.projectedLosses)
    || team.projectedWins < 0 || team.projectedLosses < 0
    || team.projectedWins + team.projectedLosses <= 0
    || !Number.isInteger(team.sourcePage) || team.sourcePage < 1 || team.sourcePage > source.sourcePageCount) {
    throw new Error(`Invalid source row ${index + 1}`);
  }
  const conference = /^(\d+)-(\d+)$/.exec(team.projectedConferenceRecord);
  if (!conference || +conference[1] > team.projectedWins || +conference[2] > team.projectedLosses) {
    throw new Error(`Conference record inconsistent with overall: ${team.team}`);
  }
  seen.add(team.team);
}

function assign(minimums) {
  return assignBands(source.teams, minimums);
}

const analysis = boundaries.map(boundary => {
  const teams = assign(boundary.minimums);
  return {
    name: boundary.name,
    minimums: boundary.minimums,
    bandCounts: names.map((name, i) => ({ name, teams: teams.filter(t => t.bandIndex === i).length })),
    candidates: candidates.map(candidate => ({
      name: candidate.name, prices: candidate.prices, min: candidate.min, max: candidate.max,
      shapes: enumerate(candidate).filter(s => s.counts.every((n, i) => n <= teams.filter(t => t.bandIndex === i).length))
        .map(shape => strongestSquad(teams, shape)).sort((a, b) => b.winPercentage - a.winPercentage),
    })),
  };
});

// The review board uses the broader hypothesis and even-price candidate, explicitly provisional.
const selected = analysis[1];
const priceModel = candidates[2];
const frontier = [15, 16, 17].map(size => selected.candidates[2].shapes.find(shape => shape.size === size));
const board = assign(selected.minimums).sort((a, b) => a.bandIndex - b.bandIndex || b.winPercentage - a.winPercentage || a.rank - b.rank);
const csv = value => `"${String(value).replaceAll('"', '""')}"`;
const header = ['Team', 'Conference', 'Projected wins', 'Projected losses', 'Projected win percentage', 'Band', 'Provisional cost', 'Torvik rank', 'PDF page', 'Season'];
const lines = board.map(t => [t.team, t.conference, t.projectedWins, t.projectedLosses, t.winPercentage.toFixed(8), names[t.bandIndex], priceModel.prices[t.bandIndex], t.rank, t.sourcePage, source.season].map(csv).join(','));
writeFileSync(new URL('../docs/cbb-season-pricing-board.csv', import.meta.url), '\uFEFF' + [header.map(csv).join(','), ...lines].join('\n') + '\n');
writeFileSync(new URL('../data/cbb-season/torvik-2027-pricing-audit.json', import.meta.url), JSON.stringify({
  sourceSha256: source.sourceSha256,
  caveats: ['Provisional price models only', 'Displayed integer projected records, not expected-win probabilities', 'Source snapshot date unknown', 'Schedule coverage including non-D-I games not independently verified', 'No conference-tournament simulation', 'Optimized record ratios are not forecasts of actual final standings'],
  analysis,
}, null, 2) + '\n');

const percent = n => (100 * n).toFixed(2) + '%';
const report = [
  '# Torvik 2026-27 provisional pricing review', '',
  'Source: user-supplied 12-page PDF, labeled 2027 T-Rank College Basketball Projections.',
  `Extracted ${source.teams.length} unique team rows with consecutive source ranks 1-365. Overall and conference records remain separate.`,
  '', '## Band availability', '',
  '| Cutoffs (Elite / Contender / Value) | Elite | Contender | Value | Long shot |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...analysis.map(a => `| ${a.minimums.slice(0, 3).map(percent).join(' / ')} | ${a.bandCounts.map(b => b.teams).join(' | ')} |`),
  '', 'The spreadsheet board uses the broader cutoffs and 10 / 8 / 6 / 4 prices as a review candidate. These have not been approved or published.',
  '', '## Strongest displayed-record combinations', '',
  'Each result maximizes combined displayed projected wins / combined displayed projected games across all legal band counts and available teams. Counts are Elite / Contender / Value / Long shot. Different schedule lengths are pooled correctly.', '',
  '| Cutoffs | Price candidate | Counts | Teams | Combined projected record | Percentage |',
  '| --- | --- | --- | ---: | --- | ---: |',
  ...analysis.flatMap(a => a.candidates.map(c => {
    const best = c.shapes[0];
    return `| ${a.name} | ${c.name} | ${best.counts.join(' / ')} | ${best.size} | ${best.wins}-${best.losses} | ${percent(best.winPercentage)} |`;
  })),
  '', '## Squad-size incentive under the review candidate', '',
  '| Squad size | Strongest combined projected record | Percentage | Band counts |',
  '| ---: | --- | ---: | --- |',
  ...frontier.map(s => `| ${s.size} | ${s.wins}-${s.losses} | ${percent(s.winPercentage)} | ${s.counts.join(' / ')} |`),
  '', 'Smaller squads have the stronger displayed-record optimum in this comparison. Do not finalize these rules as balanced; revisit prices or band requirements if multiple competitive squad sizes are a priority.',
  '', '## Leading teams by band', '',
  '| Band | Team | Projected overall record | Percentage | Cost | PDF page |',
  '| --- | --- | --- | ---: | ---: | ---: |',
  ...names.flatMap((name, i) => board.filter(t => t.bandIndex === i).slice(0, 8).map(t => `| ${name} | ${t.team} | ${t.projectedWins}-${t.projectedLosses} | ${percent(t.winPercentage)} | ${priceModel.prices[i]} | ${t.sourcePage} |`)),
  '', '## Interpretation and limits', '',
  '- The original .800 cutoff leaves only three Elite choices. The broader .750 cutoff provides 15.',
  '- Teams within each band have identical costs but different projected records. Picks near the upper boundary can be obvious bargains; the full audit exposes those selections.',
  '- A mathematically strongest projected squad is not a guaranteed winner. Forecast errors, roster changes, schedule changes, and tournament results remain unknown.',
  '- This is a static projected-record comparison, not a calibrated season simulation or historical backtest.',
  '- Projected game totals range from ' + Math.min(...board.map(t => t.games)) + ' to ' + Math.max(...board.map(t => t.games)) + '. Do not infer complete or identical schedule coverage. The PDF does not establish whether every non-D-I game or tournament game is included.',
  '- Integer displayed records lose precision; retain them as supplied rather than inventing fractional expected wins.',
  '- PDF snapshot date is unknown. Refresh and verify before opening real drafts.',
  '- The spreadsheet includes every row in this PDF, not an independently verified current membership list.',
  '', 'Regenerate: `node scripts/cbb-season-torvik-pricing.mjs`.', '',
];
writeFileSync(new URL('../docs/cbb-season-torvik-pricing-review.md', import.meta.url), report.join('\n'));
console.log(JSON.stringify(analysis.map(a => ({ cutoffs: a.name, bands: a.bandCounts, strongest: a.candidates.map(c => ({ candidate: c.name, ...c.shapes[0] })) })), null, 2));
