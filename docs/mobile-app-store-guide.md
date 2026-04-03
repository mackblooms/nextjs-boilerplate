# bracketball App Store Guide

Status: reference only

If you are deciding what to do next, start here instead:

- [Checklists and Planning Map](./checklists-and-planning-map.md)
- [App Store Review Readiness](./app-store-review-readiness.md)

This repo is now wired to ship as a downloadable app using Capacitor (native iOS/Android shells that load your hosted Next.js app).

## 1) Prerequisites

- Apple Developer Program membership (paid account).
- A production HTTPS URL for your web app (example: `https://your-domain.com`).
- A Mac with Xcode for final iOS archive/upload.
- Optional Android release path with Android Studio + Google Play Console account.

## 2) Project setup already done

- Capacitor installed (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`).
- Native projects created in `ios/` and `android/`.
- App ID configured as `com.mackbloom.bracketball` in `capacitor.config.ts`.
- Mobile scripts added to `package.json`.

## 3) Configure the app URL

Set the web URL that the app should load:

PowerShell:

```powershell
$env:CAPACITOR_APP_URL = "https://your-production-domain.com"
npm run mobile:sync
```

Optional host allow-list (comma-separated):

```powershell
$env:CAPACITOR_ALLOW_NAVIGATION = "your-production-domain.com,*.supabase.co"
npm run mobile:sync
```

## 4) Build and run locally

```bash
npm run mobile:doctor
npm run mobile:sync
npm run mobile:open:ios
npm run mobile:open:android
```

Notes:
- `mobile-web/` is only a fallback shell so sync/copy always works.
- Your real app content comes from `CAPACITOR_APP_URL`.

## 5) iOS App Store path

1. In Apple Developer, create the App ID `com.mackbloom.bracketball` if not already created.
2. In App Store Connect, create a new app using the same bundle identifier.
3. In Xcode (`ios/App/App.xcworkspace`):
   - Set signing team.
   - Set version/build numbers.
   - Add app icon and launch screen assets.
   - Confirm deployment target and capabilities.
4. Product > Archive.
5. Distribute via Organizer to App Store Connect.
6. In App Store Connect:
   - Complete app metadata (name, subtitle, description, keywords, screenshots).
   - Complete App Privacy.
   - Complete export compliance if prompted.
   - Submit for review.

## 6) Review risk to address before submission

Apple can reject apps that are only thin website wrappers. Add mobile value before final submission, such as:

- Push notifications for pool updates.
- Camera/photo uploads for profile avatar.
- Native share/deep links.
- Offline/read-only cached views.
- Mobile-specific UX improvements not present on desktop web.

## 7) Release checklist

- `CAPACITOR_APP_URL` points to production.
- HTTPS certificate valid on production domain.
- Auth/login flows work inside iOS WebView.
- External links open correctly.
- Privacy policy URL is live and added to App Store Connect.
- App icon set includes all required iOS sizes.
- TestFlight build tested on real device(s).

## 8) Working split: Windows vs Mac

Use these companion checklists to keep momentum when you only have Windows access:

- `docs/windows-daytime-checklist.md`
- `docs/app-store-connect-metadata-template.md`
- `docs/app-privacy-data-inventory.md`
- `docs/mac-release-day-checklist.md`
