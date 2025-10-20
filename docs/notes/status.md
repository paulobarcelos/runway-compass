# Current Project Status

- **Date:** 2024-04-02 (update when new changes land)
- **Active Milestone:** 1 – Auth & Sheet Handshake ([Issue #2](https://github.com/paulobarcelos/runway-compass/issues/2))
- **Latest Commit:** `feat: scaffold next.js app foundation` on `main`

## Environment & Credentials
- `.env.local` is populated with `NEXTAUTH_URL=http://localhost:3000`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` created via the Google Cloud Console.
- Google Cloud project has Sheets, Drive, and Picker APIs enabled; OAuth consent screen is in Testing mode with the app owner listed as a test user.

## Next Steps for Milestone 1
1. Install and configure `next-auth` (Auth.js) with Google provider requesting scopes: `openid email profile`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/spreadsheets` plus offline access.
2. Implement the authentication flow (server + client) and protect application routes.
3. Integrate Google Picker to allow the user to select or create a spreadsheet, then persist the `spreadsheetId` to `_meta` and local manifest storage.
4. Create initial server action/API route wrappers around the Google APIs client (Node runtime only).

## Reference Docs
- [Product Requirements](../product/PRD.md)
- [Architecture Overview](../engineering/architecture.md)
- [Engineering Process](../engineering/process.md)
- [Local Development Setup](../engineering/setup.md)
- [Decision Log](decision-log.md)

