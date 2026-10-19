import { readFileSync, writeFileSync } from 'node:fs';
import { enumerate } from './cbb-season-pricing-audit.mjs';
import { assignBands, strongestSquad } from './cbb-season-pricing-model.mjs';

const pricing = JSON.parse(readFileSync(new URL('../data/cbb-season/pricing-preview.json', import.meta.url)));
const source = JSON.parse(readFileSync(new URL('../data/cbb-season/torvik-2027-projections.json', import.meta.url)));
const model = { prices: pricing.bands.map(b => b.cost), min: pricing.bands.map(b => b.min), max: pricing.bands.map(b => b.max) };
const teams = assignBands(source.teams, pricing.bands.map(b => b.minimumPercentage));
const assess = candidate => enumerate(candidate).filter(s => s.size === pricing.squadSize).map(s => strongestSquad(teams, s));
const shapes = assess(model);
if (!shapes.length) throw new Error('No legal fixed-size squads');
const result = { version: pricing.version, sourceSha256: source.sourceSha256, squadSize: pricing.squadSize, budget: pricing.budget,
  ...model, cutoffs: pricing.bands.map(b => b.minimumPercentage), shapes,
  spread: Math.max(...shapes.map(s => s.winPercentage)) - Math.min(...shapes.map(s => s.winPercentage)),
  previousPricesAt15: assess({ ...model, prices: [12, 8, 7, 3] }),
  caveats: ['Displayed Torvik integer record ratios, not season simulations', 'Same-snapshot comparison, not independent forecast validation', 'Current source capture date and full schedule coverage remain unverified'] };
writeFileSync(new URL('../data/cbb-season/torvik-2027-fixed15-audit.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
const quote = x => `"${String(x).replaceAll('"', '""')}"`;
const csv = [['Team', 'Conference', 'Projected wins', 'Projected losses', 'Projected win percentage', 'Band', 'Preview price', 'Season', 'Squad size']];
for (const t of [...teams].sort((a, b) => a.bandIndex - b.bandIndex || b.winPercentage - a.winPercentage || a.rank - b.rank)) {
  csv.push([t.team, t.conference, t.projectedWins, t.projectedLosses, t.winPercentage.toFixed(8), pricing.bands[t.bandIndex].label, model.prices[t.bandIndex], pricing.season, pricing.squadSize]);
}
writeFileSync(new URL('../docs/cbb-season-fixed15-pricing-board.csv', import.meta.url), '\uFEFF' + csv.map(row => row.map(quote).join(',')).join('\n') + '\n');
const report = ['# Fixed 15-team season pricing', '',
  `Current preview: exactly ${pricing.squadSize} teams, exactly ${pricing.budget} points. Supersedes the earlier variable-size preview.`, '',
  '| Band | Price | Minimum | Maximum |', '| --- | ---: | ---: | ---: |',
  ...pricing.bands.map(b => `| ${b.label} | ${b.cost} | ${b.min} | ${b.max} |`), '',
  `The previous prices allow ${result.previousPricesAt15.length} band-count combination at 15 teams. The new prices allow ${shapes.length}.`, '',
  '| Elite | Contender | Value | Long shot | Teams | Points | Strongest projected record | Percentage |',
  '| ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
  ...shapes.map(s => `| ${s.counts.join(' | ')} | ${s.size} | ${s.counts.reduce((sum, n, i) => sum + n * model.prices[i], 0)} | ${s.wins}-${s.losses} | ${(s.winPercentage * 100).toFixed(2)}% |`), '',
  `The range across these optimized displayed-record ratios is ${(result.spread * 100).toFixed(2)} percentage points. This is not proof of equal contest win probabilities or an out-of-sample backtest.`,
  'Equal team counts remove the previous squad-size choice; differences in schedules, team choices and forecasting errors still matter.', '',
  '## Draft behavior', '',
  '- The sixteenth add is blocked; selected teams can always be removed.',
  '- Budget and tier caps block picks. An exact-completion warning stays advisory during building.',
  '- A squad is ready only at exactly 15 teams, exactly 100 points, and all tier requirements.',
  '- Valid v1 saved picks are repriced and restored without trimming. If over 15 teams or 100 points, remove picks before saving as v2. The original save is untouched until an explicit save.',
  '- Incomplete drafts within the caps can still be saved, including drafts needing a later swap.', '',
  'Regenerate: `node scripts/cbb-season-fixed15-audit.mjs`.', ''];
writeFileSync(new URL('../docs/cbb-season-fixed15-pricing.md', import.meta.url), report.join('\n'));
console.log(JSON.stringify({ ...result, shapes: shapes.map(({ teams: _teams, ...s }) => ({ ...s, teamCount: _teams.length })) }, null, 2));
