# Runway Compass – Architecture Overview

## System Diagram (Conceptual)
- **Client (Next.js App Router):** Authentication UI, budget/account forms, charts.
- **Server Components / API Routes:** Secure access to Google Sheets APIs via `googleapis` client.
- **Google Sheets:** Single source of truth for persistent data (`categories`, `budget_plan`, etc.).
- **Google Identity:** OAuth for user authentication and scope consent; Google Picker for sheet selection.

```
Browser (React UI)
   ↓ (session cookie / JWT)
Next.js Server (Node runtime)
   ↓ (Google APIs client)
Google Sheets & Drive
```

## Data Tabs
- `categories`: category_id, label, color, rollover_flag, sort_order.
- `accounts`: account_id, name, type, currency, include_in_runway, sort_order, last_snapshot_at.
- `snapshots`: snapshot_id, account_id, date, balance, note.
- `budget_plan`: record_id, category_id, month, year, amount, rollover_balance.
- `actuals`: txn_id, account_id, date, category_id, amount, status, entry_mode, note.
- `future_events`: event_id, type (income/expense), account_id, category_id, schedule (start_month, end_month, frequency), amount, status, linked_txn_id.
- `runway_projection`: month, year, starting_balance, income_total, expense_total, ending_balance, stoplight_status, notes.
- `_meta`: key-value pairs (selected_spreadsheet_id, schema_version, last_migration_at).

## Core Modules
- **Auth Layer:** NextAuth configuration with Google provider requesting `openid email profile`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/spreadsheets` plus offline access.
- **Sheets Client:** Wrapper around Google Sheets/Drive APIs handling batching, retries, and error normalization. See [Google Sheets reference](../notes/google-sheets-reference.md) for quotas, batching, and scope guidance.
- **Repository Layer:** Typed functions for each tab (e.g., `BudgetRepository`, `AccountRepository`) encapsulating read/write logic and schema coercion.
- **Projection Engine:** Aggregates data to compute monthly runway timeline and persists derived results in `runway_projection`.
- **UI Components:** Form editors, tables, charts, and status widgets aligned with Tailwind design system.

## Runtime Considerations
- All Google API calls stay on Node runtime (no Edge). Server Actions/API routes must opt into `dynamic = "force-dynamic"` when necessary to avoid caching issues.
- Access tokens/refresh tokens stored via NextAuth JWT strategy; refresh handled server-side before calling Sheets.
- Client stores lightweight manifest (spreadsheetId, lastSyncedAt) in localStorage to reconnect quickly.

## Error Handling & Resilience
- Implement truncated exponential backoff for 429/5xx responses from Google APIs.
- Validate tab existence and headers on session start; auto-create missing tabs using templates.
- Guard against payloads > 2 MB by chunking large writes (e.g., batching actual transactions).
- Capture structured errors and surface actionable messages to the user.

## Security & Privacy
- Private Google Sheet selected by the user; app requests `drive.file` scope to limit access to explicit files only.
- No server-side database: all persistent data resides in the spreadsheet; session data stored in encrypted cookies.
- Store minimal PII; rely on Google account identity only.

## Deployment
- Hosted on Vercel (Node runtime for API routes). Environment variables configured via Vercel UI (no `.env` committed).
- GitHub Actions (future) can run lint/tests; initial deployments via Vercel auto-deploy from `main`.

## Future Enhancements (Technical)
- Background sync job to refresh projections when future events change (serverless cron on Vercel).
- Optional local caching layer (IndexedDB) for offline-first editing.
- CSV import pipeline with mapping service.
