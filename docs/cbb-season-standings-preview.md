# College basketball standings preview

Route: `/college-basketball/standings`. Reach it through the new season tabs or
the signed-in season dock's Standings link. The builder and standings share a
layout; tournament standings and APIs remain unchanged.

## Playable features

- Eight explicitly fictional squads, each a legal 15-team, 100-point build.
- Eighteen sample days, day navigation, and an opt-in replay of each day's finals.
- Combined winning-percentage ranking, shared ties, daily rank movement, today's
  completed results, seven-calendar-day records, and last ten owned team results.
- Biggest daily climber, hottest seven-day record (minimum three results), and a
  selected squad's Value/Long-shot standout (minimum three team results).
- Clickable squad names, sample pick ownership, all 15 team records, and race
  history with an accessible table alternative to the SVG chart.
- Next-game rank scenarios: every squad owning either opponent updates together.
  These assume only that game finishes next; they are not projections.
- Recent sample finals show scores and their +1 win/loss effect, including both
  opponents on a squad producing one win and one loss.
- Explicit opt-in comparison of a complete local saved draft with the sample
  league. Its picks never leave the browser or become a public entry.
- Search, empty states, loading/error feedback, mobile tables and navigation.

## Data and scoring contracts

`lib/cbbSeasonDemo.ts` deterministically generates invented fixtures for all 365
source teams, plus clearly named sample non-DI opponents. The real Torvik records
only seed the demonstration; generated scores are never presented as real results.
Future sample outcomes stay out of rankings and scenarios until their completion
time. A local squad is omitted unless it meets the current complete-squad rules.

`lib/cbbSeasonStandings.ts` is a pure scoring module, separate from demo generation:

- Rank by exact fractions, not rounded display percentages; use shared ranks 1,1,3.
- Zero-game squads are unranked. Their first rank has no invented movement delta.
- Include official regular-season and conference-tournament results for the
  configured season. Non-DI opponents count; exhibitions and later postseason do not.
- Only completed valid finals count. Invalid final winners are surfaced as unscored.
- Count both owned sides independently. Shared team picks benefit every owner.
- Use completion dates in America/Chicago for daily and seven-calendar-day metrics.
- Compare daily movement with ranks before that day's finals. Historic points are
  calculated from the same fixture ledger at earlier cutoffs.
- Reject duplicate game IDs, duplicate squad IDs and duplicate team picks instead
  of double-counting. A production importer must upsert corrections by game ID.
- An explicit participating winner can represent a forfeit without numeric scores.

The extra metrics do not change scoring. "Value standout" means the strongest
qualifying sample record among the selected squad's lower-price picks, not a bonus.
Ownership is limited to this sample field, not site-wide ownership or user activity.

## Verification and remaining work

Run `npm run lint`, `npm test`, and `npm run build`. Standings tests cover exact
ties, display-rounding differences, both-owned opponents, non-DI games, postseason
boundaries, invalid and pending results, Chicago day boundaries, seven-day windows,
rank movement, shared-owner scenarios, duplicate data and legal sample squads.

This preview has no live score feed, shared league persistence, real accounts in
the leaderboard, actual historical rank snapshots or public squad reveal. Production
tracking still requires account-owned squads and leagues, private-until-lock access
policies, a verified official game ledger, ingestion/reconciliation, and refresh
behavior. Existing preseason source freshness and schedule-coverage caveats remain.
