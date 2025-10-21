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
