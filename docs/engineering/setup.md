# Local Development Setup

## Prerequisites
- **Node.js:** v22.x (Vercel runtime). Use a version manager such as `nvm` or `fnm` (`.nvmrc` provided).
- **npm:** Bundled with Node ≥20 (v10+). Yarn and pnpm are optional.
- **GitHub CLI:** Optional but recommended for issue/project management (`gh`).
- **Google Cloud Account:** Required to configure OAuth credentials in the next milestone.

## Install Dependencies
```bash
npm install
```

The generated project already includes Tailwind CSS v4, TypeScript, and ESLint. Running `npm install` will hydrate the `node_modules` directory.

## Development Commands
- `npm run dev` – Start the Next.js development server at `http://localhost:3000`.
- `npm run build` – Create an optimized production build.
- `npm run start` – Serve the production build locally.
- `npm run lint` – Run ESLint across the project.

## Environment Variables
Create a `.env.local` file (ignored by git) with the following variables. Replace placeholders with the values generated in Google Cloud and via your secret generator.

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generated-random-secret>
GOOGLE_CLIENT_ID=<oauth-client-id>
GOOGLE_CLIENT_SECRET=<oauth-client-secret>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<oauth-client-id>
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=<browser-api-key>
NEXT_PUBLIC_GOOGLE_PICKER_PROJECT_NUMBER=<project-number-optional>
```

> Generate a secure `NEXTAUTH_SECRET` using `openssl rand -base64 32` or an equivalent tool. Google credentials require an OAuth client configured in the Google Cloud console (documented below).

`NEXT_PUBLIC_GOOGLE_CLIENT_ID` should match `GOOGLE_CLIENT_ID` so the browser-based Google Picker can request user tokens. The `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` is a standard Maps/Picker API key created in the same Google Cloud project (restrict it to the Picker API). `NEXT_PUBLIC_GOOGLE_PICKER_PROJECT_NUMBER` is optional but recommended; supply the Google Cloud project number to improve Picker telemetry and Drive integration.

## Google Cloud OAuth (Preparation)
1. Create/sign in to a Google Cloud project dedicated to Runway Compass.
2. Enable the **Google Sheets API**, **Google Drive API**, and **Google Picker API**.
3. Open the OAuth consent screen, set the publishing status to *Testing*, and add yourself as a test user.
4. Create an OAuth 2.0 **Web application** client with authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
5. Store the generated Client ID and Client Secret securely; they populate both server (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and client (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
6. Create an API key restricted to the Picker API and use it for `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY`. Retrieve the project number from Google Cloud and assign it to `NEXT_PUBLIC_GOOGLE_PICKER_PROJECT_NUMBER` if desired.

> These steps establish the baseline so the Auth & Sheet handshake milestone can focus on application wiring instead of console setup.
