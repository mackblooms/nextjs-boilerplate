# bracketball Mac Release-Day Checklist

Status: specialized final-day checklist, not the master release checklist

Start with [App Store Review Readiness](/Users/mackbloom/nextjs-boilerplate/docs/app-store-review-readiness.md) before using this file.

Run this on your Mac once Windows prep docs are complete.

## 1) Local setup

- [ ] Install latest Xcode and accept license.
- [ ] Sign in to Xcode with Apple Developer account.
- [ ] Install project deps:
  - `npm install`
- [ ] Verify Capacitor dependencies:
  - `npm run mobile:doctor`

## 2) Sync app content into native project

- [ ] Set production URL and sync:
  - `export CAPACITOR_APP_URL="https://your-production-domain.com"`
  - `npm run mobile:sync`
- [ ] Open iOS project:
  - `npm run mobile:open:ios`

## 3) Xcode project configuration

- [ ] Open `ios/App/App.xcworkspace`.
- [ ] Confirm bundle identifier is `com.mackbloom.bracketball`.
- [ ] Select Team under Signing and Capabilities.
- [ ] Set `Marketing Version` and `Build`.
- [ ] Add final app icons/splash assets.
- [ ] Verify deployment target and capabilities.

## 4) Validation and archive

- [ ] Run on iPhone simulator.
- [ ] Run on at least one physical iPhone.
- [ ] Fix iOS-specific issues (auth redirects, keyboard, safe areas, deep links).
- [ ] Product -> Archive.
- [ ] Upload with Organizer to App Store Connect.

## 5) App Store Connect completion

- [ ] Paste finalized metadata from template doc.
- [ ] Complete App Privacy section from inventory doc.
- [ ] Complete export compliance prompts.
- [ ] Attach screenshots.
- [ ] Submit to TestFlight first.
- [ ] Submit for App Review after TestFlight validation.

## 6) Post-upload checks

- [ ] Confirm build processing completed in App Store Connect.
- [ ] Run full smoke test from TestFlight build.
- [ ] Resolve reviewer notes quickly if rejected.
