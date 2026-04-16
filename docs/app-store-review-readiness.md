# bracketball App Store Review Readiness

Use this as the master checklist before you archive in Xcode or submit in App Store Connect.

## Product readiness

- [ ] Mobile nav feels app-like on a real iPhone, not like a desktop site.
- [ ] Home, Drafts, Pools, leaderboard, bracket, Profile, login, password reset, and legal pages are comfortable on small screens.
- [ ] Tapping a joined pool card opens the pool leaderboard directly.
- [ ] `Share Invite` is visible and reliable from the leaderboard screen.
- [ ] Push notification opt-in appears in Profile and can be enabled on a physical iPhone.
- [ ] Native avatar upload works from photo library and camera on a physical iPhone.
- [ ] Universal-link handoff opens the app cleanly from a `www.bracketball.io` pool link.
- [ ] Tap targets feel reliable with one hand.
- [ ] Safe-area spacing looks right on notched iPhones.
- [ ] Keyboard does not cover key form fields or action buttons.
- [ ] External links and mail links open correctly from the iOS app shell.
- [ ] Loading, empty, and error states are understandable on mobile.

## Thin-wrapper risk reduction

- [ ] Ship at least one clearly mobile-specific feature before submission.
- [x] Native share for pool invites
- [x] Push notifications for pool updates
- [x] Camera/library avatar upload
- [x] Universal/deep-link support into pools
- [ ] Reviewer can immediately see why the app is useful on a phone.
- [ ] Review path highlights at least two native/mobile-specific features without needing explanation from you.

## Account and reviewer access

- [ ] Create a stable reviewer test account.
- [ ] Seed the account with at least one ready-to-open pool, one saved draft, and at least one joined pool leaderboard with visible standings.
- [ ] If any feature depends on private data, make sure reviewer credentials can reach it.
- [ ] Prepare short reviewer notes that explain the main flow in under 6 steps.
- [ ] Decide whether reviewer should test push notifications.
  If yes: include exact steps and expected result.
  If no: keep push enabled in production but do not make review depend on it.

## Legal and contact pages

- [ ] Privacy Policy page is live at `/privacy`.
- [ ] Terms of Service page is live at `/terms`.
- [ ] Support page is live at `/support`.
- [ ] Support email is monitored.

## App Store Connect

- [ ] App record exists with bundle ID `com.mackbloom.bracketball`.
- [ ] Subtitle, description, keywords, support URL, and privacy policy URL are filled.
- [ ] App Privacy answers match actual production behavior and third-party SDK usage.
- [ ] Screenshots are captured from the real app shell on iPhone, not desktop browser views.
- [ ] Review notes explain login and test flow clearly.
- [ ] Screenshot order tells a coherent story:
  - home
  - pools
  - leaderboard
  - bracket
  - profile/avatar
  - push/share or draft flow

## Screenshot pass

- [ ] Use a real iPhone build, not Safari or desktop mockups.
- [ ] Use seeded data that looks polished and realistic.
- [ ] Remove temporary debug content before capture.
- [ ] Use the same visual style across all captures: consistent theme, no broken states, no half-complete pools.
- [ ] Capture at least these screens:
  - Home screen with app-like nav visible
  - Pools screen with joined pools and discover flow
  - Pool leaderboard screen with share button
  - Pool bracket screen
  - Profile screen with avatar and push notifications section
  - Draft or pool-entry flow
- [ ] Optional extra captures if they look strong:
  - Invite/share flow
  - Notification-enabled profile state
  - Deep-linked pool open state

## Privacy + disclosures

- [ ] App Privacy in App Store Connect includes notification token/device preference collection.
- [ ] Privacy Policy mentions push notification token and device-level notification preference data.
- [ ] If Vercel Analytics remains enabled in production, include analytics-related disclosures as appropriate.

## Xcode release day

- [ ] `CAPACITOR_APP_URL` points at production.
- [ ] `npm run mobile:sync` completed against production URL.
- [ ] Final app icon set is installed in `Assets.xcassets`.
- [ ] Version and build are updated.
- [ ] Archive uploads successfully.
- [ ] TestFlight smoke test passes on a physical iPhone before final review submission.
- [ ] Push Notifications capability remains enabled and signing still succeeds.
- [ ] Associated Domains capability remains enabled and universal links still work.
