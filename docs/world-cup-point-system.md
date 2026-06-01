# World Cup Draft Pricing and Scoring

Status: proposed launch rules, calibrated on May 31, 2026.

## Design Goals

- Keep the existing 100-point draft budget.
- Allow any number of teams while enforcing the 100-point budget.
- Limit each draft to 3 teams priced 20 points or higher.
- Price teams from their full tournament path, not reputation alone.
- Reward group-stage results immediately.
- Make low-priced teams genuinely exciting without making cheap-team accumulation the dominant strategy.
- Freeze prices when the draft library opens. Do not move prices after users can save drafts.

## Price Model

The current seeded board uses the path-aware model as its quantitative backbone, then
applies conservative market-informed manual adjustments where publicly available
sportsbook futures materially disagree.

The path-aware input is the May 29, 2026 Goldman Sachs Monte Carlo model. It simulates
50,000 tournaments, applies official group tiebreakers, accounts for all 495 possible
Round-of-32 pairings, and includes Elo, recent competitive form, scoring talent,
geography, and draw difficulty.

Before drafts open, replace the manual market review with a reproducible sportsbook
input using the median de-vigged implied probability across available
books for each market. Use group qualification, group winner, semifinal, final, and
tournament winner markets when available. Use the model's conditional stage ratios where
a sportsbook stage market is unavailable. Median probabilities are preferable to a best
price because they resist outliers and promotional lines.

The provisional launch prices below are explicit tournament tiers informed by full-path
base-score expected value under the proposed rules. The reproducible audit is available
through `npm run sim:world-cup-pricing`. Tier buckets make the pricing easier to explain,
limit false precision, and keep picking restrictions predictable. Bonus EV is reported
separately instead of feeding back into price, because the bonuses intentionally preserve
upside for value teams. Re-run the calibration once immediately before drafts open, then
freeze it.

Until match-level group odds are imported, the audit estimates expected group-result
points as `2 + 14 x P(advance to R32)`. This stays inside the possible 0-to-18 group
points range and gives stronger group-stage teams appropriate credit.

## Launch Price Board

| Tier | Cost | Teams |
| --- | ---: | --- |
| Diamond | 24 | Spain |
| Platinum | 22 | Argentina, France |
| Gold | 20 | Brazil, England, Germany, Netherlands, Portugal |
| Silver | 17 | Belgium, Canada, Colombia, Croatia, Ecuador, Mexico, Norway, Switzerland, Turkiye |
| Bronze | 14 | Australia, Austria, Czechia, IR Iran, Japan, Korea Republic, Morocco, Paraguay, Senegal, Uruguay, USA |
| Value | 12 | Algeria, Bosnia and Herzegovina, Cote d'Ivoire, Egypt, Jordan, New Zealand, Panama, Scotland, Sweden, Uzbekistan |
| Longshot | 10 | Cabo Verde, Congo DR, Curacao, Haiti, Saudi Arabia, South Africa, Tunisia |
| Moonshot | 7 | Ghana, Iraq, Qatar |

## Base Scoring

| Event | Points |
| --- | ---: |
| Group-stage win | 6 |
| Group-stage draw | 2 |
| Advance from group to Round of 32 | 12 |
| Win Round of 32 and reach Round of 16 | 18 |
| Win Round of 16 and reach quarterfinal | 30 |
| Win quarterfinal and reach semifinal | 48 |
| Win semifinal and reach final | 72 |
| Win final and become champion | 100 |

The 6/2 group scoring is FIFA's 3/1 table scoring doubled. It makes every group match
matter while preserving a clear win premium. Knockout advancement becomes progressively
more valuable, so a champion remains the center of a strong draft.

Do not apply March Madness seed multipliers or opponent-based upset bonuses to World Cup
results. Team costs already incorporate group strength and projected knockout path.

## Value Pick Bonuses

Teams costing less than 15 points receive additional cumulative Value Run bonuses when
they reach the Round of 16 and beyond.

| Milestone | Additional bonus |
| --- | ---: |
| Reach Round of 16 | 8 |
| Reach quarterfinal | 16 |
| Reach semifinal | 28 |
| Reach final | 42 |
| Become champion | 60 |

Longshot- and Moonshot-tier teams costing 10 points or less also receive a Breakout Bonus:

| Milestone | Additional bonus |
| --- | ---: |
| Advance from group | 24 |

Every team receives the same 6 base points for a group-stage win. The Breakout Bonus is
reserved for the harder achievement: a low-priced team surviving its group.

## Anti-Arbitrage Check

Because roster size is unlimited, each pricing run includes a 0/1 knapsack optimization
across the 100-point budget while enforcing the max-3 elite-team cap. Cheap-team
accumulation must not dominate the optimizer. With the current rules, the highest
projected-EV portfolio is `Spain, France, Argentina, Mexico, Senegal`.

## Implementation Notes

- World Cup scoring must branch by `competition_slug`; it cannot reuse the March Madness
  seed multiplier and `R64` bonus path.
- Group draws require persisted game completion state and scores. A null
  `winner_team_id` alone cannot distinguish a draw from an unfinished game.
- Group advancement should be persisted after official standings are settled, including
  the eight best third-place teams.
- World Cup archives and leaderboard tiebreakers should use semifinalists and finalists,
  not March Madness-specific Final Four language.
- Add exhaustive tests for group wins, draws, third-place advancement, low-price bonus
  milestones, and mixed-competition isolation.

## Calibration Sources

- FIFA official 48-team field and competition format.
- Goldman Sachs Global Investment Research, *The World Cup and Economics: World Cup
  2026 Predictions, Probabilities, and Paths to Victory*, May 29, 2026.
- Oddschecker World Cup odds comparison.
- Covers World Cup futures analysis, updated May 26, 2026.
- Ladbrokes full 48-team outright board.
- Duelbits group-stage qualification markets, posted May 14, 2026.
