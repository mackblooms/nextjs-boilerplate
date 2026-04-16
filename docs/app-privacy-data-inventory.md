# App Privacy Data Inventory (App Store Connect)

Use this worksheet to prepare your App Privacy answers before submission.

For each data type your app collects, fill the rows below.

## How to fill

- Collected: `Yes` or `No`.
- Linked to User: `Yes` if associated with account/profile/device identity.
- Used for Tracking: `Yes` if used for cross-app/site tracking or data broker sharing.
- Purpose: Pick all that apply:
  - App Functionality
  - Analytics
  - Developer Communications
  - Product Personalization
  - Advertising/Marketing
  - Fraud Prevention/Security
  - Other

## Data matrix

| Data Type | Collected | Linked to User | Used for Tracking | Purpose | Notes |
| --- | --- | --- | --- | --- | --- |
| Name | Yes | Yes | No | App Functionality | Profile display name and full name. |
| Email Address | Yes | Yes | No | App Functionality, Developer Communications | Authentication and support contact. |
| User ID | Yes | Yes | No | App Functionality, Fraud Prevention/Security | Account and gameplay identity. |
| Device ID | Yes | Yes | No | App Functionality | Push installation identifier stored per device. |
| Product Interaction | Yes | Yes | No | Analytics, App Functionality | App usage and gameplay-related interactions. |
| Crash Data | No/Confirm |  |  |  | Confirm whether any crash tooling beyond platform defaults is active. |
| Performance Data | No/Confirm |  |  |  | Confirm whether any performance SDK is active. |
| Other Diagnostic Data | No/Confirm |  |  |  | Confirm what Vercel/client telemetry is disclosed. |
| Photos or Videos | Yes | Yes | No | App Functionality | Optional avatar upload from camera or library. |
| Other User Content | Yes | Yes | No | App Functionality | Bio, drafts, picks, entries, pool participation. |
| Precise Location | No | No | No |  |  |
| Coarse Location | No/Confirm |  |  |  | IP-derived operational logs may exist server-side; confirm App Store interpretation. |
| Contacts | No | No | No |  |  |
| Search History | No | No | No |  |  |
| Browsing History | No | No | No |  |  |
| Purchases | No | No | No |  |  |
| Financial Info | No | No | No |  |  |
| Sensitive Info | No | No | No |  |  |
| Audio Data | No | No | No |  |  |
| Health/Fitness | No | No | No |  |  |

## Final checks

- [ ] Privacy Policy URL is live and matches actual behavior.
- [ ] Data use answers match app runtime behavior in production.
- [ ] Third-party SDK collection behavior is included.
- [ ] Push notification token and device-level notification preference data are included.
- [ ] If analytics SDK is present, event taxonomy is documented.
