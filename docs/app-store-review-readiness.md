# bracketball App Store Review Readiness

Use this as the master checklist before you archive in Xcode or submit in App Store Connect.

## Product readiness

- [ ] Mobile nav feels app-like on a real iPhone, not like a desktop site.
- [ ] Home, Drafts, Pools, Pool view, Profile, login, password reset, and legal pages are comfortable on small screens.
- [ ] Tap targets feel reliable with one hand.
- [ ] Safe-area spacing looks right on notched iPhones.
- [ ] Keyboard does not cover key form fields or action buttons.
- [ ] External links and mail links open correctly from the iOS app shell.
- [ ] Loading, empty, and error states are understandable on mobile.

## Thin-wrapper risk reduction

- [ ] Ship at least one clearly mobile-specific feature before submission.
- [ ] Good first candidates:
  - native share for pool invites
  - push notifications for pool updates
  - camera/library avatar upload polish
  - deep links into pools or entries
  - offline cached read-only screens
- [ ] Reviewer can immediately see why the app is useful on a phone.

## Account and reviewer access

- [ ] Create a stable reviewer test account.
- [ ] Seed the account with at least one ready-to-open pool and one draft.
- [ ] If any feature depends on private data, make sure reviewer credentials can reach it.
- [ ] Prepare short reviewer notes that explain the main flow in under 6 steps.

## Legal and contact pages

- [ ] Privacy Policy page is live at `/privacy`.
- [ ] Terms of Service page is live at `/terms`.
- [ ] Support page is live at `/support`.
- [ ] Support email is monitored.

## App Store Connect

- [ ] App record exists with bundle ID `com.mackbloom.bracketball`.
- [ ] Subtitle, description, keywords, support URL, and privacy policy URL are filled.
- [ ] App Privacy answers match actual production behavior and third-party SDK usage.
- [ ] Screenshots are captured from the real app shell on iPhone.
- [ ] Review notes explain login and test flow clearly.

## Xcode release day

- [ ] `CAPACITOR_APP_URL` points at production.
- [ ] `npm run mobile:sync` completed against production URL.
- [ ] Final app icon set is installed in `Assets.xcassets`.
- [ ] Version and build are updated.
- [ ] Archive uploads successfully.
- [ ] TestFlight smoke test passes on a physical iPhone before final review submission.
