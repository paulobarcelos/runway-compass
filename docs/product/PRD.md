# Runway Compass – Product Requirements

## Overview
- **Problem:** Single user needs visibility into a 12–24 month cash runway while juggling multiple accounts, rolling budgets, and known future events.
- **Solution:** A Next.js web app backed by a private Google Sheet that captures budgets, actuals, future-dated cash flows, and balance snapshots to forecast runway health.
- **Status:** Draft MVP scope; future enhancements tracked separately.

## Success Metrics
- User can project runway for at least 12 months with accurate green/yellow/red status.
- Monthly budget, actuals, and future events can be entered without CSV imports.
- Manual balance snapshots across all accounts keep projected vs actual variance within an acceptable threshold (≤5% variance month-over-month).

## Personas
- **Primary:** Solo user managing personal finances through multiple bank accounts and cash reserves while transitioning employment status.
- **Secondary (future):** Same user across multiple devices needing persistent access to the same Google Sheet.

## Goals
1. Provide a frictionless manual entry workflow for budgets, actuals, snapshots, and future events.
2. Deliver a clear runway timeline highlighting when income covers spend, when savings bridge the gap, and when funds run out.
3. Maintain all persistent data exclusively in Google Sheets while keeping the Next.js app stateless beyond session context.

## Non-Goals
- Automated bank transaction imports (CSV or API integrations) in the MVP.
- Multi-user sharing, access control, or collaboration features.
- Notifications, emails, or push alerts.

## Product Scope (MVP)
### Budget Planning
- Capture per-category monthly allocations that fuel runway projections.
- Surface variance warnings when actual spending exceeds the allocated amount.
- Support editing category labels and ordering.

### Accounts & Snapshots
- Manage multiple accounts (bank, digital wallets, cash) with snapshot history.
- Allow monthly baseline updates and ad-hoc captures for cash reserves.

### Cash Flow Planning
- Maintain a single ledger of income and expense items with status (`planned`, `posted`, `void`).
- Log future cash flows ahead of time, then reconcile them by flipping status and capturing final amounts.
- Allow ad-hoc actual entries when spending deviates from the original plan.

### Runway Dashboard
- Present monthly projection table and chart with green/yellow/red segments.
- Summarize key dates: last month income covers expenses, month savings deplete.

## Roadmap Milestones
1. **Foundation:** Project scaffold, Google auth setup, environment documentation.
2. **Auth & Sheet Handshake:** Sign-in flow, picker, `_meta` manifest.
3. **Schema & Repository:** Create/validate Sheet tabs, batching helpers, schema guards.
4. **Budget Planner:** Category budgets, cash-flow ledger, runway timeline projection.
5. **Accounts & Snapshots:** Account CRUD and snapshot capture/history.
6. **Actuals & Adjustments:** Manual reconciliation flows and variance reporting.
7. **Runway Dashboard:** Projection engine, stoplight visualization, variance insights.
8. **Polish & Deploy:** UX cleanup, docs, deployment to Vercel.

## Open Questions
- Do we store scenario toggles alongside projections or defer entirely to backlog?
- What threshold defines acceptable variance between projected and actual balances?
- Should we offer recurring cash-flow helpers or continue with manual duplication?
