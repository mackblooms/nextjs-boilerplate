# College Basketball Season builder preview

Route: `/college-basketball`. Reach it through the Sports page, competition cards,
or the home sport rail. This is a local implementation until deployed through the
existing Bracketball deployment workflow; it does not create a separate hosted Site.

## Included behavior

- All 365 team rows from the supplied 2027 Torvik PDF, with projected overall records.
- Proposed prices 12 / 8 / 7 / 3 and limits E 0-3, C 0-6, V 4-10, L 5-8.
- Search, conference and band filtering, sort, selected-only view, progressive loading.
- Add/remove picks, pooled projected record, budget and band requirement feedback.
- Picks are blocked only by the available budget and band caps. A warning explains
  when the mix needs a later swap to finish at exactly 100 with all band minimums.
- Explicit local draft save, restore, storage-error feedback and clear confirmation.
- Mobile squad links, shared controls, loading/error/empty states, keyboard labels and focus states.

Pricing comes from `data/cbb-season/pricing-preview.json`; raw projections remain in
`data/cbb-season/torvik-2027-projections.json`. The feature's tests compare the pricing
configuration against the reviewed balance-audit artifact to catch unintended drift.

Drafts use `bb:cbb-season:preview-draft` in browser local storage. One draft is supported
per browser profile/origin, not per account. Saving a new draft replaces the previous
preview draft; draft incompatibilities and browser storage failures are surfaced.
Incomplete drafts that need a swap can be saved and restored. They are never marked
ready until they spend exactly 100 and meet all band minimums and caps.
The version guards against restoring picks with a different pricing model. There is
no server write, account synchronization, public squad URL, entry submission or reveal.
Preview picks remain editable because a contest and official lock time have not launched.

`competitionChoices` adds a navigation entry without adding a new `CompetitionSlug` to
the tournament APIs. Existing March Madness and World Cup drafts, locks, pools and
scoring retain their existing competition identities. The public preview bypasses
profile completion and the tournament onboarding guide.

## Validation and next work

Run `npm run lint`, `npm test`, and `npm run build`. Unit checks cover all 11 legal
band-count compositions, every prefix of those compositions, budget dead ends,
availability, duplicate picks, threshold boundaries, pooled records and local save validation.

Before an actual contest, finalize pricing, verify source freshness and schedule
coverage, then implement account-owned persistence, league membership, a server-enforced
deadline, private-until-lock access policies, reveal, actual result ingestion and standings.
The current projected records must not be shown as real season results.
