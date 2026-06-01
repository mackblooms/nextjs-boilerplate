# World Cup Draft Pricing and Scoring

Status: proposed launch rules, calibrated on May 31, 2026.

## Design Goals

- Keep the existing 100-point draft budget.
- Require exactly 8 teams in each World Cup squad.
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
`npm run sim:world-cup-pricing`. Value Run Bonus EV is reported separately instead of
feeding back into price, because the bonus intentionally preserves upside for inexpensive
teams. Re-run the calibration once immediately before drafts open, then freeze it. A
sensible automated blend for that final run is 65% path-aware model probability and 35%
de-vigged median sportsbook probability.

Until match-level group odds are imported, the audit estimates expected group-result
points as `2 + 14 x P(advance to R32)`. This stays inside the possible 0-to-18 group
points range and gives stronger group-stage teams appropriate credit.

## Launch Price Board

| Group | Team | Cost |
| --- | --- | ---: |
| A | Mexico | 11 |
| A | South Africa | 4 |
| A | Korea Republic | 7 |
| A | Czechia | 7 |
| B | Canada | 9 |
| B | Bosnia and Herzegovina | 6 |
| B | Qatar | 4 |
| B | Switzerland | 10 |
| C | Brazil | 16 |
| C | Morocco | 8 |
| C | Haiti | 4 |
| C | Scotland | 6 |
| D | USA | 8 |
| D | Paraguay | 8 |
| D | Australia | 7 |
| D | Turkiye | 9 |
| E | Germany | 13 |
| E | Curacao | 4 |
| E | Cote d'Ivoire | 6 |
| E | Ecuador | 9 |
| F | Netherlands | 14 |
| F | Japan | 8 |
| F | Sweden | 6 |
| F | Tunisia | 5 |
| G | Belgium | 10 |
| G | Egypt | 6 |
| G | IR Iran | 7 |
| G | New Zealand | 6 |
| H | Spain | 24 |
| H | Cabo Verde | 5 |
| H | Saudi Arabia | 4 |
| H | Uruguay | 8 |
| I | France | 21 |
| I | Senegal | 8 |
| I | Iraq | 4 |
| I | Norway | 10 |
| J | Argentina | 19 |
| J | Algeria | 6 |
| J | Austria | 7 |
| J | Jordan | 6 |
| K | Portugal | 13 |
| K | Colombia | 11 |
| K | Uzbekistan | 6 |
| K | Congo DR | 5 |
| L | England | 14 |
| L | Croatia | 10 |
| L | Ghana | 4 |
| L | Panama | 6 |

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

## Value Run Bonus

Low-priced teams receive an additional cumulative milestone bonus.

```text
value_unit = max(0, 10 - team_cost)
```

| Milestone | Additional bonus |
| --- | ---: |
| Advance from group | 1 x value_unit |
| Reach Round of 16 | 2 x value_unit |
| Reach quarterfinal | 4 x value_unit |
| Reach semifinal | 6 x value_unit |
| Reach final | 8 x value_unit |
| Become champion | 12 x value_unit |

Examples:

- A 6-point team that reaches the quarterfinal earns `4 + 8 + 16 = 28` bonus points.
- A 4-point team that merely escapes its group earns 6 bonus points.
- Teams costing 10 or more receive no Value Run Bonus.

This is the World Cup equivalent of the March Madness 14-to-16 seed bonus. It rewards a
surprising run rather than a single noisy result.

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
