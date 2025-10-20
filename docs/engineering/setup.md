# Local Development Setup

## Prerequisites
- **Node.js:** v20.12 or newer (LTS). Use a version manager such as `nvm` or `fnm`.
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
Create a `.env.local` file (ignored by git) with placeholders for upcoming integrations. The values will be populated during Milestone 1.

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-generated-secret
GOOGLE_CLIENT_ID=replace-me
GOOGLE_CLIENT_SECRET=replace-me
```

> Generate a secure `NEXTAUTH_SECRET` using `openssl rand -base64 32` or an equivalent tool. Google credentials require an OAuth client configured in the Google Cloud console (documented below).

## Google Cloud OAuth (Preparation)
1. Create/sign in to a Google Cloud project dedicated to Runway Compass.
2. Enable the **Google Sheets API**, **Google Drive API**, and **Google Picker API**.
3. Open the OAuth consent screen, set the publishing status to *Testing*, and add yourself as a test user.
4. Create an OAuth 2.0 **Web application** client with authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
5. Store the generated Client ID and Client Secret securely; they will populate `.env.local` in Milestone 1.

> These steps establish the baseline so the Auth & Sheet handshake milestone can focus on application wiring instead of console setup.

