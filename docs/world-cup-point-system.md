# World Cup Draft Pricing and Scoring

Status: proposed launch rules, calibrated on May 31, 2026.

## Design Goals

- Keep the existing 100-point draft budget.
- Allow any number of teams while enforcing the 100-point budget.
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

The provisional launch prices below are integer buckets derived from full-path base-score
expected value under the proposed rules. The reproducible audit is available through
`npm run sim:world-cup-pricing`. A `0.38` nonlinear curve compresses the raw EV gaps so
the elite contender tier stays expensive without allowing Spain's model edge to push
other major contenders too far down the board. Bonus EV is reported separately instead
of feeding back into price, because the bonuses intentionally preserve upside for value
teams. Re-run the calibration once immediately before drafts open, then freeze it.

Until match-level group odds are imported, the audit estimates expected group-result
points as `2 + 14 x P(advance to R32)`. This stays inside the possible 0-to-18 group
points range and gives stronger group-stage teams appropriate credit.

## Launch Price Board

| Group | Team | Cost |
| --- | --- | ---: |
| A | Mexico | 18 |
| A | South Africa | 9 |
| A | Korea Republic | 14 |
| A | Czechia | 14 |
| B | Canada | 16 |
| B | Bosnia and Herzegovina | 13 |
| B | Qatar | 7 |
| B | Switzerland | 16 |
| C | Brazil | 20 |
| C | Morocco | 14 |
| C | Haiti | 8 |
| C | Scotland | 13 |
| D | USA | 15 |
| D | Paraguay | 14 |
| D | Australia | 13 |
| D | Turkiye | 16 |
| E | Germany | 19 |
| E | Curacao | 8 |
| E | Cote d'Ivoire | 12 |
| E | Ecuador | 16 |
| F | Netherlands | 19 |
| F | Japan | 15 |
| F | Sweden | 12 |
| F | Tunisia | 10 |
| G | Belgium | 16 |
| G | Egypt | 13 |
| G | IR Iran | 14 |
| G | New Zealand | 12 |
| H | Spain | 24 |
| H | Cabo Verde | 10 |
| H | Saudi Arabia | 9 |
| H | Uruguay | 15 |
| I | France | 23 |
| I | Senegal | 15 |
| I | Iraq | 4 |
| I | Norway | 17 |
| J | Argentina | 22 |
| J | Algeria | 12 |
| J | Austria | 14 |
| J | Jordan | 12 |
| K | Portugal | 19 |
| K | Colombia | 17 |
| K | Uzbekistan | 12 |
| K | Congo DR | 9 |
| L | England | 19 |
| L | Croatia | 17 |
| L | Ghana | 7 |
| L | Panama | 12 |

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

## Underdog Bonus

Teams costing less than 10 points receive additional cumulative bonuses for group-stage
success.

| Result | Additional bonus |
| --- | ---: |
| Group-stage win | 4 |
| Advance from group | 10 |

## Value Run Bonus

Teams costing 15 points or less receive additional cumulative bonuses for a knockout run.
Teams below 10 can earn both bonus types.

| Milestone | Additional bonus |
| --- | ---: |
| Reach Round of 16 | 8 |
| Reach quarterfinal | 16 |
| Reach semifinal | 28 |
| Reach final | 42 |
| Become champion | 60 |

Examples:

- An 8-point team that wins one group game, escapes its group, and reaches the
  quarterfinal earns `4 + 10 + 8 + 16 = 38` bonus points.
- A 15-point team that reaches the quarterfinal earns `8 + 16 = 24` bonus points.
- A team priced above 15 receives base scoring only.

These are the World Cup equivalents of the March Madness underdog bonuses. They reward
both immediate group-stage excitement and a sustained surprise run.

## Anti-Arbitrage Check

Because roster size is unlimited, each pricing run includes a 0/1 knapsack optimization
across the 100-point budget. With the current board and bonuses, the highest projected-EV
portfolio is `Spain, France, Argentina, Brazil, Qatar, Iraq`. Cheap-team accumulation does
not dominate the optimizer.

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
