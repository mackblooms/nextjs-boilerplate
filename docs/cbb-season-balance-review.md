# College basketball season balance review

Status: proposed alternative for review. No published pricing, squad rules, scoring or website changed.

## What was tested

Searched 78,720 price/limit configurations using the supplied Torvik records; 5,243 met the stated structural criteria.
Cutoffs remain .750 / .625 / .500. All candidates spend exactly 100, permit each team once, use pooled record percentages, and have no explicit total team limit.
Elite prices stay at 12 or below. Search bounds, selection criteria, every selected squad, and deterministic stress probes are in the JSON audit.
A combination means a count in each band, not an individual team roster. Thousands of individual rosters can share one combination.

## Proposed alternative

| Band | Previous price | Candidate price | Allowed purchases |
| --- | ---: | ---: | --- |
| Elite | 10 | 12 | 0-3 |
| Contender | 8 | 8 | 0-6 |
| Value | 6 | 7 | 4-10 |
| Long shot | 4 | 3 | 5-8 |

The candidate offers 11 distinct band-count combinations, spanning 15-18 teams. The previous candidate offered 12, spanning 15-17.
Long shots become cheaper but are required in greater numbers. Value teams become more expensive, making it harder to buy cheap depth alongside a small collection of favorites.

## Strongest displayed projected record by size

| Teams | Previous candidate | Proposed alternative | Alternative band counts (E / C / V / L) |
| ---: | ---: | ---: | --- |
| 15 | 65.15% | 61.30% | 3 / 0 / 7 / 5 |
| 16 | 62.73% | 61.15% | 1 / 3 / 7 / 5 |
| 17 | 60.38% | 60.46% | 1 / 4 / 5 / 7 |
| 18 | Unavailable | 59.57% | 0 / 6 / 4 / 8 |

The previous 15-17 frontier spread was 4.77 percentage points. The candidate's full 15-18 spread is 1.74 points.
These are optimized ratios of displayed projections, not expected realized winning percentages or guarantees of equal chances.

## All legal band-count combinations

| Elite | Contender | Value | Long shot | Teams | Projected optimum |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 0 | 7 | 5 | 15 | 61.30% |
| 1 | 3 | 7 | 5 | 16 | 61.15% |
| 2 | 2 | 6 | 6 | 16 | 60.98% |
| 3 | 1 | 5 | 7 | 16 | 60.65% |
| 1 | 4 | 5 | 7 | 17 | 60.46% |
| 2 | 3 | 4 | 8 | 17 | 60.31% |
| 0 | 5 | 6 | 6 | 17 | 60.19% |
| 1 | 0 | 10 | 6 | 17 | 57.92% |
| 0 | 6 | 4 | 8 | 18 | 59.57% |
| 1 | 1 | 8 | 8 | 18 | 57.53% |
| 0 | 2 | 9 | 7 | 18 | 57.38% |

## Sensitivity checks

For each band separately, shift every team by one win in either direction at fixed games. Hold original selected rosters, prices and bands fixed, then compare the best original rosters by size. These eight hypothetical probes are not simulations of feasible game outcomes or confidence intervals.

| Candidate | Smallest probe spread | Largest probe spread |
| --- | ---: | ---: |
| Previous | 4.39 pp | 5.26 pp |
| Alternative | 0.94 pp | 2.82 pp |

## Tradeoffs and recommendation

The narrowest nominal spread found was 1.11 points using 12 / 8 / 7 / 3 prices, but it offered only 5 band-count combinations. The proposed alternative preserves more constructions and includes 18-team squads.
Carry this alternative into review rather than finalizing the previous candidate. It reduces the nominal size incentive while preserving low prices, compulsory underdogs and simple scoring. It does not eliminate the incentive or establish equal win probabilities.
Five or more long-shot selections is a meaningful new restriction. Owners must be comfortable following several projected losing teams; total projected percentages decrease partly because stronger builds are constrained, not because everyone gains better teams.
All within-band picks still have equal prices despite different projections. Upper-boundary bargains and concentration in the strongest projected teams remain. Pricing alone cannot make every possible squad equally strong.
No historical preseason holdout or schedule-consistent simulation is available. Do not treat optimizing against this same snapshot or the stress probes as independent proof of fairness. Actual outcome variance and overlapping schedules can change contest win probabilities.
Source capture date, current membership and inclusion of all non-D-I games remain unverified. Conference-tournament games count in the contest but are not separately modeled here.

Regenerate with `node scripts/cbb-season-balance-audit.mjs`.
