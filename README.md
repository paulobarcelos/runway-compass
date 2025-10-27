
# Runway Compass

Personal cash runway planner built with Next.js and Google Sheets. Track rolling budgets, manual actuals, future events, and account balances to understand when income covers expenses and when savings will deplete.

## Getting Started

### Prerequisites
- Node.js **22.x** (see `.nvmrc`), npm 10+.
- GitHub CLI (`gh`) for Issues/Projects automation (optional but recommended).
- Google Cloud project with Sheets, Drive, and Picker APIs enabled.

### Install & Run
1. `npm install`
2. Create `.env.local` (git-ignored) with:
   ```
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<openssl rand -base64 32>
   GOOGLE_CLIENT_ID=<oauth-client-id>
   GOOGLE_CLIENT_SECRET=<oauth-client-secret>
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=<oauth-client-id>
   NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=<picker-api-key>
   NEXT_PUBLIC_GOOGLE_PICKER_PROJECT_NUMBER=<optional-project-number>
   ```
3. Configure Google OAuth client:
   - Redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Consent screen in *Testing* mode with yourself as test user.
   - Create Picker API key restricted to the Picker API.
4. Commands:
   - `npm run dev` – start local dev server.
   - `npm run lint` – lint sources.
   - `npm run build` / `npm run start` – production build + serve.

### Deploying to Vercel
- Import repo, keep default build (`npm run build`).
- Set environment variables for Production + Preview (`NEXTAUTH_URL`, Google secrets, Picker keys).
- Configure OAuth redirect URIs for production domains (e.g., `https://runway.paulobarcelos.com/api/auth/callback/google`).

## Source-of-Truth
- Journal: https://github.com/paulobarcelos/runway-compass/wiki/Journal
- Decisions: https://github.com/paulobarcelos/runway-compass/wiki/Decisions
- Product Requirements (MVP): https://github.com/paulobarcelos/runway-compass/wiki/Product-PRD
- Core Use Cases: https://github.com/paulobarcelos/runway-compass/wiki/Product-Use-Cases
- Engineering Setup: https://github.com/paulobarcelos/runway-compass/wiki/Engineering-Setup
- Architecture Overview: https://github.com/paulobarcelos/runway-compass/wiki/Engineering-Architecture
- Feature Ideas & Experiments: https://github.com/paulobarcelos/runway-compass/discussions/categories/ideas
- Active Issues backlog: https://github.com/paulobarcelos/runway-compass/issues
- Roadmap board: https://github.com/users/paulobarcelos/projects/1
