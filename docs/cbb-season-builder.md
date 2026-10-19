# College Basketball Season builder preview

Route: `/college-basketball`. Reach it through the Sports page, competition cards,
or the home sport rail. This is a local implementation until deployed through the
existing Bracketball deployment workflow; it does not create a separate hosted Site.

The companion `/college-basketball/standings` route is a playable, clearly labeled
sample-league preview. See `docs/cbb-season-standings-preview.md`. It can compare a
complete saved draft privately against fictional scores; it does not publish picks.

## Included behavior

- All 365 team rows from the supplied 2027 Torvik PDF, with projected overall records.
- Exactly 15 teams and exactly 100 points to complete a squad.
- Proposed prices 12 / 10 / 6 / 4 and limits E 0-3, C 0-6, V 4-10, L 5-8.
- Search, conference and band filtering, sort, selected-only view, progressive loading.
- Add/remove picks, pooled projected record, budget and band requirement feedback.
- A 15-spot tracker shows picks, actual final tier counts, and teams still needed
  in each tier. Ranges cover only the full 15-team/100-point mixes compatible with
  current picks; the expandable mix table makes their relationship explicit.
  Once one mix remains, counts become exact. Invalid mixes get a suggested legal
  target with explicit additions and removals instead of misleading minimums.
- Picks are blocked by the available budget, 15-team cap and band caps. A warning
  explains when the mix needs a swap to finish at exactly 15 teams and 100 points
  with all band minimums. Completion feasibility remains advisory while building.
- Explicit local draft save, restore, storage-error feedback and clear confirmation.
- Mobile squad links, shared controls, loading/error/empty states, keyboard labels and focus states.

Pricing comes from `data/cbb-season/pricing-preview.json`; raw projections remain in
`data/cbb-season/torvik-2027-projections.json`. The feature's tests compare the pricing
configuration against the reviewed balance-audit artifact to catch unintended drift.

Drafts use `bb:cbb-season:preview-draft` in browser local storage. One draft is supported
per browser profile/origin, not per account. Saving a new draft replaces the previous
preview draft; draft incompatibilities and browser storage failures are surfaced.
Incomplete drafts that need a swap can be saved and restored within the team and
budget caps. They are never marked ready until they have exactly 15 teams, spend
exactly 100 and meet all band minimums and caps. Valid v1 drafts are migrated to the
new prices in memory without trimming any picks or overwriting the original save.
If an old draft is over 15 teams or over budget, remove picks before saving as v2.
Other unknown versions are rejected. There is
no server write, account synchronization, public squad URL, entry submission or reveal.
Preview picks remain editable because a contest and official lock time have not launched.

`competitionChoices` adds a navigation entry without adding a new `CompetitionSlug` to
the tournament APIs. Existing March Madness and World Cup drafts, locks, pools and
scoring retain their existing competition identities. The public preview bypasses
profile completion and the tournament onboarding guide.

## Validation and next work

Run `npm run lint`, `npm test`, and `npm run build`. Unit checks cover all four legal
band-count compositions, every prefix of those compositions, budget dead ends,
availability, duplicate picks, threshold boundaries, pooled records, the sixteenth
pick, incorrect squad sizes at 100 points and preservation of old saved picks.

Run `node scripts/cbb-season-fixed15-audit.mjs` to reproduce the current pricing
review and spreadsheet. Earlier variable-size audit files are historical comparisons.

Before an actual contest, finalize pricing, verify source freshness and schedule
coverage, then implement account-owned persistence, league membership, a server-enforced
deadline, private-until-lock access policies, reveal, actual result ingestion and standings.
The current projected records must not be shown as real season results.
