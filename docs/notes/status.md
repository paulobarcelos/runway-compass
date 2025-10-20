# Current Project Status

- **Date:** 2025-10-20 (update when new changes land)
- **Active Milestone:** 1 – Auth & Sheet Handshake ([Issue #2](https://github.com/paulobarcelos/runway-compass/issues/2))
- **Latest Commit:** `feat: scaffold next.js app foundation` on `main`

## Environment & Credentials
- `.env.local` is populated with `NEXTAUTH_URL=http://localhost:3000`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` created via the Google Cloud Console.
- Google Cloud project has Sheets, Drive, and Picker APIs enabled; OAuth consent screen is in Testing mode with the app owner listed as a test user.

## Recent Progress
- Installed and configured `next-auth` with Google provider requesting `openid email profile`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/spreadsheets`, and offline access.
- Implemented session guard, Google sign-in/out UI, and protected the app shell behind authentication.
- Added Google Picker-based spreadsheet selection with manifest storage and `_meta` persistence.
- Exposed API route and Sheets client helpers for future CRUD operations.
- Enabled spreadsheet creation flow to bootstrap new Google Sheets from the app.

## Next Steps for Milestone 1
1. Finish Google Sheets repository scaffolding for `_meta` bootstrap and schema validation.
2. Begin server-side tab creation for core tables (categories, accounts, budget_plan, etc.).

## Reference Docs
- [Product Requirements](../product/PRD.md)
- [Architecture Overview](../engineering/architecture.md)
- [Engineering Process](../engineering/process.md)
- [Local Development Setup](../engineering/setup.md)
- [Decision Log](decision-log.md)
