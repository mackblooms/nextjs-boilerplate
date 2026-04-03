# bracketball Windows Daytime Checklist

Status: specialized support checklist, not the master release checklist

Start with [App Store Review Readiness](/Users/mackbloom/nextjs-boilerplate/docs/app-store-review-readiness.md) if you are deciding priorities.

Use this list for work you can complete on Windows so Mac time is only for Xcode signing, archive, and upload.

## Daily flow

- [ ] Pull latest code and install deps.
  - `git pull`
  - `npm install`
- [ ] Run app locally and test key flows.
  - `npm run dev`
- [ ] Keep mobile shell in sync after app changes.
  - `npm run mobile:sync`
- [ ] Commit and push with clear release-focused messages.

## Release prep tasks (Windows-safe)

- [ ] Confirm production web URL and routing behavior.
  - Decide final `CAPACITOR_APP_URL`.
  - Decide `CAPACITOR_ALLOW_NAVIGATION` hosts (if needed).
- [ ] Verify in-app critical flows on mobile viewport:
  - Auth (sign up, sign in, sign out).
  - Pool creation and join.
  - Draft save/edit.
  - Profile update.
  - External link handling.
- [ ] Create release notes draft (`What's New` text).
- [ ] Fill App Store metadata template:
  - `docs/app-store-connect-metadata-template.md`
- [ ] Fill App Privacy data inventory:
  - `docs/app-privacy-data-inventory.md`
- [ ] Prepare support and legal URLs:
  - Privacy Policy URL
  - Support URL
  - Marketing URL (optional)
- [ ] Finalize visual assets:
  - App icon source file
  - Screenshots copy plan (actual iPhone captures can happen on Mac)

## Thin-wrapper risk reduction

- [ ] Ship at least one mobile-native value add before submission:
  - Push notifications
  - Native share/deep links
  - Offline read-only caching
  - Camera/photo usage

## Hand-off package for Mac session

- [ ] Code pushed to main release branch.
- [ ] `docs/app-store-connect-metadata-template.md` completed.
- [ ] `docs/app-privacy-data-inventory.md` completed.
- [ ] Version target decided (`Marketing Version` and build increment plan).
- [ ] Open issues list prepared for iOS-specific fixes from simulator/device testing.
