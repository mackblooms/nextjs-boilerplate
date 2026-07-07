# AGENTS.md

This is a modern sports gaming web app.

## Product identity

This app should feel closer to:
- fantasy sports apps
- tournament platforms
- modern sports media
- draft rooms
- live scoring experiences

Avoid:
- boring enterprise dashboards
- generic SaaS styling
- random one-off UI patterns

## Development philosophy

Priorities:
1. Preserve existing functionality
2. Improve UI/UX incrementally
3. Build reusable components
4. Maintain clean architecture

Never rewrite the entire application unless explicitly requested.

## UI/UX standards

Every change should move the app toward a polished, app-like product.

Focus on:
- Clear visual hierarchy
- Consistent spacing
- Consistent typography
- Consistent colors
- Reusable components
- Mobile responsiveness
- Accessibility
- Fast user flows

## Design system

Prefer:
- Shared buttons
- Shared cards
- Shared inputs
- Shared layouts
- Shared navigation components

Avoid:
- Random one-off styles
- Inline styling unless necessary
- Duplicate components

## User experience requirements

When building features, include:
- Loading states
- Empty states
- Error states
- Success feedback
- Hover states
- Focus states
- Mobile layouts

## UI style direction

The app should feel:
- Competitive
- Fast
- Clean
- Sports-native
- Premium
- Mobile-friendly

Think:
- Sleeper
- ESPN fantasy
- DraftKings/FanDuel polish
- modern tournament dashboards

## Before editing

First:
- Understand the existing structure
- Identify reusable patterns
- Explain planned changes

## After editing

Always:
- Summarize changed files
- Explain what improved
- Mention any risks
- Run available checks:
  - npm run lint
  - npm run build
  - tests if available
