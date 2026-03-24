# bracketball 2-Week Implementation Roadmap

Date: 2026-03-12  
Owner: Mack + Codex

## Week 1 (P0): Conversion + Onboarding Friction

### Day 1: Funnel Analytics Foundation
- [x] `P0` Add `analytics_events` table and indexes via migration.
  - Estimate: 0.5h
  - Acceptance: migration runs cleanly; table visible in Supabase.
- [x] `P0` Add `/api/analytics/track` endpoint to ingest events.
  - Estimate: 1h
  - Acceptance: endpoint validates payload and writes event rows.
- [x] `P0` Add client `trackEvent()` helper with `sendBeacon` fallback.
  - Estimate: 0.75h
  - Acceptance: events post from browser without blocking UI.
- [x] `P0` Instrument core events:
  - `home_cta_click`
  - `pool_create_attempt|success|failure`
  - `pool_join_attempt|success|failure`
  - `draft_save_attempt|success|failure`
  - `profile_save_attempt|success|failure`
  - Estimate: 2h
  - Acceptance: events appear in DB with timestamp + event_name + path.

### Day 2: UI Primitive Pass
- [ ] `P0` Create shared primitives/classes for button/input/card/status.
  - Estimate: 2h
  - Acceptance: at least Home, Login, New Pool, Profile consume shared styles.
- [ ] `P1` Reduce duplicated inline styles in top-level pages by 30%+.
  - Estimate: 2h
  - Acceptance: style consistency improves and files shrink.

### Day 3: Homepage Conversion Rewrite
- [ ] `P0` Rewrite hero headline/subhead around outcome.
  - Estimate: 1h
  - Acceptance: one primary CTA, one secondary CTA, clear value proposition.
- [ ] `P0` Add "How it works in 3 steps" summary on home.
  - Estimate: 1.5h
  - Acceptance: scannable steps with links into draft/leaderboard flows.
- [ ] `P1` Add trust/credibility strip (beta notes, update cadence, etc.).
  - Estimate: 1h
  - Acceptance: visible proof/info near CTA section.

### Day 4: Pools Discovery + Join/Create Friction
- [ ] `P0` Add pools search/filter and improve empty states.
  - Estimate: 2h
  - Acceptance: user can quickly find/join pool by name.
- [ ] `P0` Improve join/create feedback states and error copy.
  - Estimate: 1.5h
  - Acceptance: errors are specific and next-step oriented.

### Day 5: Auth + Profile Onboarding Copy
- [ ] `P0` Tighten sign-in/sign-up helper text and validation messaging.
  - Estimate: 1.5h
  - Acceptance: fewer ambiguous auth errors.
- [ ] `P1` Add profile completion progress cues.
  - Estimate: 1.5h
  - Acceptance: user sees what fields remain before continue.

## Week 2 (P1): Draft/Bracket Clarity + Engagement

### Day 6: Draft Usability
- [ ] `P1` Add team search and quick filters (seed bands / cost).
  - Estimate: 2.5h
  - Acceptance: draft selection can be narrowed instantly.
- [ ] `P1` Improve invalid-state messaging with exact violated cap.
  - Estimate: 1.5h
  - Acceptance: users know exactly why add/save failed.

### Day 7: Bracket Readability + Mobile
- [ ] `P1` Refine zoom controls and simplify control labels.
  - Estimate: 1.5h
  - Acceptance: less confusion around fit/100%/zoom buttons.
- [ ] `P1` Add mobile-focused bracket fallback guidance.
  - Estimate: 2h
  - Acceptance: small screens have usable default view path.

### Day 8: Leaderboard UX
- [ ] `P1` Improve score context and row readability.
  - Estimate: 1.5h
  - Acceptance: users can parse rank + score + bracket access faster.
- [ ] `P1` Clarify hidden-until-lock rules in-place.
  - Estimate: 1h
  - Acceptance: fewer "why can’t I view this bracket?" moments.

### Day 9: Content Upgrade ("How it works")
- [ ] `P1` Rewrite rules page for skimmability and examples.
  - Estimate: 2.5h
  - Acceptance: shorter paragraphs, examples, FAQ anchors.

### Day 10: A11y + Performance Hardening
- [ ] `P1` Accessibility pass (focus states, contrast, labels, keyboard checks).
  - Estimate: 2h
  - Acceptance: critical flows keyboard operable and high-contrast safe.
- [ ] `P1` Perf pass (image optimization, preloading strategy, JS review).
  - Estimate: 2h
  - Acceptance: measurable reduction in initial load and interactive delay.

## Reporting Cadence
- Daily: close completed tickets, open blockers, confirm next-day P0.
- End of week: compare funnel conversion before/after instrumentation.

