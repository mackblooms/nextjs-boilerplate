# CBB player profiles and stat projections

Public directory: `/cbb/players`. Profiles: `/cbb/players/[id]`. The existing admin board links to both. Public pages expose ranking factors but not administrative notes, user identifiers, or research mutation APIs.

## Refresh historical stats

Run `node scripts/import-cbb-stat-baselines.mjs` to download the 2025–26 Bart Torvik CSV, or pass a downloaded CSV path as the first argument. The importer writes `data/cbb/stat-baselines.json` and an audit of rejected rows. Its positional schema follows the primary source implementation at https://github.com/sportsdataverse/hoopR/blob/main/R/torvik_player_stats.R. Shooting counts are season totals; minutes, rebounds, assists, steals, blocks and points are per-game fields. Turnovers are derived from assists / AST:TO and are explicitly labeled estimates.

Rows with inconsistent scoring totals, missing fields, invalid counts, or an unexpected season are excluded. A schema failure with fewer than 1,000 valid records aborts before replacing the dataset. Name normalization removes accents, punctuation and suffixes, but matching also requires the historical team (previous team for transfers, current team otherwise). Ambiguous matches remain unavailable. Team aliases beyond State/St. need explicit verification before adding; no fuzzy name-only matches.

## Experimental model v0.1

`lib/cbbStatProjection.ts` contains the pure model, separate from the BBPR calibration. Existing rankings are not modified.

- Role maps to a 6–35 MPG target. Returners blend 55% prior minutes / 45% role target, plus an opportunity adjustment. Newcomers use the role target.
- Offensive burden and opportunity adjust attempts per minute. Development adjusts non-shooting rates. Missing required factors produce an unavailable state, not zeroes or generic defaults.
- Makes come from attempts times shrunk accuracy. Draft priors: 50% 2P (50 attempts), 33% 3P (75 attempts), 72% FT (40 attempts). Points and aggregate FG% are derived from the same makes and attempts; no independent PPG adjustment.
- Newcomers use game-weighted prior-season freshman position cohorts (at least 10 players with 15 games and 12 MPG). Entry talent adjusts shot volume. This is a broad position baseline, not a researched individual shooting forecast. International players share the newcomer baseline and should receive individual evidence in a future model.
- Scenario ranges adjust minutes and usage. They are not calibrated prediction intervals. Ranking confidence only widens/narrows scenarios and must not be presented as statistical accuracy.
- No pace, team minute budget, injury, opponent-strength translation or individual skill-development model is claimed. Raw difficulty scores stay in the ranking breakdown until their relation to stat rates is validated.

## Validation still needed before production forecasting claims

The UI explicitly labels the model experimental. No out-of-sample accuracy claim is made. To calibrate it, collect earlier seasons and historical pre-season factor snapshots, evaluate predicted minutes, counts and shooting percentages against actual outcomes, compare against prior-year persistence, and report MAE plus scenario coverage by returner/transfer/newcomer cohort. Current ranking factors cannot substitute for historical snapshots without leakage. Tune priors and coefficients on training years; reserve a later season for evaluation. Validate team rotation budgets before publishing team-level aggregates.

Tests cover source consistency, identity collisions, missing inputs, scoring identities, shooting zeros, scenario ordering and dataset-wide coverage. Run `npm test`, `npm run lint`, and `npm run build`.

Run `node scripts/audit-cbb-stat-projections.mjs` with Node 22.18+ to report current coverage and missing-data reasons. Add `http://localhost:3000` to smoke-check the directory, each projection state and a missing profile against the running app.
