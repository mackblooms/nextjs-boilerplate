# Fixed 15-team season pricing

Current preview: exactly 15 teams, exactly 100 points. Supersedes the earlier variable-size preview.

| Band | Price | Minimum | Maximum |
| --- | ---: | ---: | ---: |
| Elite | 12 | 0 | 3 |
| Contender | 10 | 0 | 6 |
| Value | 6 | 4 | 10 |
| Long shot | 4 | 5 | 8 |

The previous prices allow 1 band-count combination at 15 teams. The new prices allow 4.

| Elite | Contender | Value | Long shot | Teams | Points | Strongest projected record | Percentage |
| ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 0 | 5 | 5 | 5 | 15 | 100 | 280-179 | 61.00% |
| 1 | 4 | 4 | 6 | 15 | 100 | 282-178 | 61.30% |
| 2 | 2 | 6 | 5 | 15 | 100 | 285-176 | 61.82% |
| 3 | 1 | 5 | 6 | 15 | 100 | 284-178 | 61.47% |

The range across these optimized displayed-record ratios is 0.82 percentage points. This is not proof of equal contest win probabilities or an out-of-sample backtest.
Equal team counts remove the previous squad-size choice; differences in schedules, team choices and forecasting errors still matter.

## Draft behavior

- The sixteenth add is blocked; selected teams can always be removed.
- Budget and tier caps block picks. An exact-completion warning stays advisory during building.
- A squad is ready only at exactly 15 teams, exactly 100 points, and all tier requirements.
- Valid v1 saved picks are repriced and restored without trimming. If over 15 teams or 100 points, remove picks before saving as v2. The original save is untouched until an explicit save.
- Incomplete drafts within the caps can still be saved, including drafts needing a later swap.

Regenerate: `node scripts/cbb-season-fixed15-audit.mjs`.
