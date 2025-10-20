# Current Project Status

- **Date:** 2025-10-22 (update when new changes land)
- **Active Milestone:** 1 – Auth & Sheet Handshake ([Issue #2](https://github.com/paulobarcelos/runway-compass/issues/2))
- **Latest Commit:** `refactor: share sheet repository helpers` on `feature/solo-progress`

## Environment & Credentials
- `.env.local` is populated with `NEXTAUTH_URL=http://localhost:3000`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` created via the Google Cloud Console.
- Google Cloud project has Sheets, Drive, and Picker APIs enabled; OAuth consent screen is in Testing mode with the app owner listed as a test user.

## Recent Progress
- Installed and configured `next-auth` with Google provider requesting `openid email profile`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/spreadsheets`, and offline access.
- Implemented session guard, Google sign-in/out UI, and protected the app shell behind authentication.
- Added Google Picker-based spreadsheet selection with manifest storage and `_meta` persistence.
- Exposed API route and Sheets client helpers for future CRUD operations.
- Enabled spreadsheet creation flow to bootstrap new Google Sheets from the app.
- Added background bootstrap sync on login to ensure `_meta` sheet stays aligned.
- Enforced sheet schema bootstrap with automatic tab/header creation.
- Implemented repositories and tests for `_meta`, `categories`, `accounts`, `budget_plan`, and `snapshots` tabs.

## Next Steps for Milestone 1
1. Implement repositories for remaining tabs (actuals, future_events, runway_projection).
2. Introduce server routes/actions that use repositories for CRUD.
3. Begin UI wiring for budget planner once repositories stabilize.

## Reference Docs
- [Product Requirements](../product/PRD.md)
- [Architecture Overview](../engineering/architecture.md)
- [Engineering Process](../engineering/process.md)
- [Local Development Setup](../engineering/setup.md)
- [Decision Log](decision-log.md)
