# College basketball season pricing worksheet

Status: planning candidates only. No live prices, database, scoring, or UI changed.

## Torvik source and first team-level review

The user selected Bart Torvik's projected records and supplied a 12-page PDF labeled
2027 T-Rank College Basketball Projections. Its 365 rows are transcribed in
`data/cbb-season/torvik-2027-projections.json`, including original rank, overall
record, separate conference record, PDF page, and a SHA-256 of the source document.
The capture date is unknown. These are displayed integer projections; fractional
expected wins, complete schedule coverage, and non-D-I coverage are not established.

Run `node scripts/cbb-season-torvik-pricing.mjs` to regenerate:

- `docs/cbb-season-pricing-board.csv`: all 365 provisional named-team prices.
- `docs/cbb-season-torvik-pricing-review.md`: cutoff comparison and optimized squad results.
- `data/cbb-season/torvik-2027-pricing-audit.json`: every tested squad shape and selected teams.

The original .800 / .650 / .500 boundaries yield only three Elite teams. A broader
.750 / .625 / .500 hypothesis yields 15 Elite, 77 Contender, 132 Value, and 141
Long-shot teams. The CSV uses those broader boundaries with 10 / 8 / 6 / 4 prices
for review only; neither the boundaries nor those prices are final.

Under that candidate, the strongest displayed-record ratio is 65.15% for 15 teams,
62.73% for 16, and 60.38% for 17. This flags an incentive toward smaller squads;
it is not a simulated outcome, historical backtest, or proof of competitive balance.

No source selection or pricing artifact creates a new site section.

## Agreed contest foundation

- Everyone spends exactly 100 points before the first official game of the season.
- Squads remain private until the deadline, then reveal together.
- No transfers; no explicit overall squad-size limit. Target approximately 15-18 teams.
- Limits by price encourage lower-cost selections.
- Standings use pooled official wins divided by pooled official games, not an average of team percentages.
- Include non-Division I opponents and conference tournaments. Exclude exhibitions, scrimmages, NCAA tournament and other postseason games.
- Prices should reflect projected regular-season winning percentage, including all official opponents, rather than prestige or tournament title odds.

## Structural audit

Run `node scripts/cbb-season-pricing-audit.mjs`.

Counts below are distinct band-count combinations, NOT individual squads, probabilities,
or predictions of user behavior. Assume enough distinct selectable teams in each band;
team availability must be checked after assignment. Each team may be selected once per squad.

| Candidate | Elite / Contender / Value / Long shot prices | Band limits | Legal combinations | Squad sizes |
| --- | --- | --- | ---: | --- |
| Original draft | 12 / 8 / 5 / 4 | E <=3; C <=5; V >=4; L >=3 | 50 | 14-24 |
| Tighter limits | 12 / 8 / 5 / 4 | E 0-2; C 0-5; V 4-8; L 3-6 | 7 | 15-18 |
| Even prices | 10 / 8 / 6 / 4 | E 0-2; C 0-5; V 4-8; L 3-6 | 12 | 15-17 |

The original draft does not reliably constrain squad size to the target. Its only odd
price is 5: modulo four, spending exactly 100 requires Value selections in multiples
of four. Tighter limits therefore force exactly four or eight Value teams.

The even-price candidate is a recommendation for further testing, not an approved
replacement. It removes that multiples-of-four restriction and supports more band
combinations under the proposed limits. It still has an exact-budget parity constraint:
the combined number of Elite and Value selections must be even.

Example even-price squads (Elite / Contender / Value / Long shot):

- 2 / 5 / 4 / 4: 100 points, 15 teams.
- 1 / 4 / 7 / 4: 100 points, 16 teams.
- 0 / 4 / 8 / 5: 100 points, 17 teams.

## Candidate assignment boundaries

These are hypotheses to test against a complete projection dataset, not calibrated thresholds:

| Band | Projected regular-season winning percentage | Even-price candidate |
| --- | --- | ---: |
| Elite | >= .800 | 10 |
| Contender | >= .650 and < .800 | 8 |
| Value | >= .500 and < .650 | 6 |
| Long shot | < .500 | 4 |

For 31 games, 25 projected wins would qualify as Elite, 21 as Contender, 17 as Value,
and 14 as Long shot. Use fractional expected wins and actual scheduled game counts
for real assignments, without rounding percentages across a boundary. Strong
mid-major programs can belong in Elite; power-conference programs can belong in Long shot.

Do not assign a team to the cheapest band because its projection is missing. Hold
its assignment for research. Freeze a reviewed board before squad selection opens;
do not change costs underneath saved squads.

## Projection research and required validation

The repository's existing CBB model projects player statistics. Its documented limitations
include team rotation budgets and opponent translation; it is not a validated team-win
model. Do not convert its player rankings directly into team prices.

Public sources inspected:

- https://getthebreakdown.com/teams/ provides projected conference records. Those are
  insufficient for this contest's full-schedule win percentages.
- https://basketballquant.com/preseason describes preseason win-total projections,
  but the inspected public page does not expose a complete numerical projection table.
  It is a candidate source to investigate, not an imported or validated dataset.

Before publishing named team prices, obtain a season-labeled, complete Division I
team list and full regular-season schedule with opponent and venue classifications.
Record expected wins, scheduled games, source, snapshot date, and uncertainty for
every team. Verify non-Division I games are included in the projections.

With matchup probabilities, expected wins are the sum of game win probabilities;
both sides of each D-I game must sum to one expected win. Do not independently invent
records for opponents. Conference tournament games need a separate simulation because
advancement changes both wins and games played. They count in contest validation even
if the band assignment metric stays regular-season winning percentage.

Validate each candidate using actual team choices within bands, pooled expected wins
and games, and simulated season outcomes. Report strongest constructions, boundary
bargains, overlapping selections, conference concentration, and sensitivity to forecast
errors. Check whether smaller favorite-heavy squads consistently dominate larger squads.
Adding a team below a squad's current percentage lowers that percentage: cheapness alone
does not create value in this format. Mandatory low-tier picks are a deliberate constraint.

Historical validation must use projections available before that historical season,
not final records masquerading as preseason forecasts. No competitive-balance or
forecast-accuracy claim has been established by this structural audit.
