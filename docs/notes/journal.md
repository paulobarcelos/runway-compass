# Runway Compass – Engineering Journal

Use this journal to capture durable insights that don’t belong in GitHub issues or the decision log. Examples:

- Gotchas uncovered while integrating Google APIs.
- Performance measurements, troubleshooting steps, or heuristics worth revisiting.
- Links to reference material that helped unblock work.

Keep entries evergreen:

1. Start each entry with a short heading (e.g., `## 2025-10-22 – Sheets batching heuristics`).
2. Focus on knowledge that will help a future agent act faster; avoid day-to-day status updates (those belong in GitHub).
3. If an entry supersedes earlier advice, update or prune it so the journal stays trustworthy.

This journal is optional but encouraged—treat it as shared memory that makes the next task smoother.

## 2025-10-21 – Currency normalization TODOs
- Budgets now store a single monthly amount per category along with a currency code.
- Need future work to add a base display currency toggle and conversion pipeline for category budgets, account balances, actuals, and projections.
- Conversion source undecided: evaluate Google Sheets `GOOGLEFINANCE` vs a lightweight external FX API, log latency/caching implications before implementation.
- Base currency preference should live client-side (e.g., localStorage) with server default to USD until we expose user configuration.
- Consider building a reusable "monetary input" component (amount + currency dropdown + flag/name) to reduce ISO-code typos once core flows are in place.

## 2025-10-22 – Ordering UX follow-ups
- Accounts and categories currently expose numeric `sort_order` inputs; plan to replace with drag-to-reorder widget once we finalize shared list UX.

## 2025-10-22  – Accounts diagnostics structural errors
- Sheets `values.get` 400/404 responses or "Unable to parse range" now map to `missing_sheet`/`range_error` diagnostics instead of throwing so API clients can surface actionable messaging.
- Header mismatches short-circuit repository parsing with `header_mismatch` plus the expected column list; client workflows should read the `errors` array alongside `warnings`.

## 2025-10-23 – Cash-flow ledger + projection plan
- Milestone 3 pivots to a single `cash_flows` sheet with statuses (`planned`, `posted`, `void`) replacing the budget grid and split actual/future tabs.
- Runway timeline will be computed server-side from category monthly budgets, ledger entries, and account snapshots; projected balances extend beyond the latest snapshot.
- Planned entries flip to posted in place, capturing actual dates/amounts so projections and actuals stay in one record.
- Documentation, API routes, and repositories must align before implementation so multiple agents can tackle ledger, projection, and UI work in parallel.

## 2025-10-23 – Hosted environment baseline
- Vercel project now exposes production (`runway.paulobarcelos.com`) and floating staging (`staging.runway.paulobarcelos.com`) domains with matching Google OAuth redirect URIs.
- Environment variables mirror the local `.env.local` values across Production and Preview (`NEXTAUTH_URL` uses `$VERCEL_URL` for previews).
- GitHub Actions CI runs `npm ci`, `npm run lint`, `npm test`, and `npm run build` on every PR update; Vercel previews remain independent.
- When full auth QA is needed, reassign `staging.runway.paulobarcelos.com` to the desired preview; otherwise the default preview URL is sufficient.

## 2025-10-24 – CI checks vs branch protection
- GitHub’s pending/yellow check can persist when required contexts don’t match; we removed the stale "CI" context via the API and set the rule to the exact workflow name (`CI / build-and-test (pull_request)`).
- For solo development, review requirements cause self-approval blockers; we temporarily removed the approval gate while keeping CI enforced.
