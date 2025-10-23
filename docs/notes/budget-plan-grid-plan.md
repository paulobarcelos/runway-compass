// ABOUTME: Summarizes Budget Planner milestone scope and sequencing.
// ABOUTME: Guides implementation of the cash-flow ledger and runway timeline.

# Budget Planner Milestone Plan

## Scope
- Deliver a runway timeline that merges projected and actual cash across months, highlighting when balances hit warning thresholds.
- Replace the monthly budget grid with a cash-flow ledger that tracks planned and posted income/expenses in one place.
- Keep category budgets as simple monthly allocations feeding projections and variance warnings.

## Decisions
- Ledger records carry `planned_amount`, optional `actual_amount`, and status (`planned`, `posted`, `void`); flipping to `posted` moves values from projections into actual totals.
- Timeline starts from the latest account snapshot and projects forward using posted cash plus planned items and category budgets.
- Category budgets remain editable in the existing manager; no rollover math or monthly overrides.

## Out of Scope
- Recurring cash-flow automation or templates.
- Scenario toggles, sensitivity analysis, or multi-sheet comparisons.
- Drag-and-drop ordering or advanced sorting for the ledger lists.

## Current State Snapshot
- Category manager already provides manifest gating, base-currency display, and per-category monthly budget editing.
- Accounts & snapshots module persists account balances, providing the factual starting point for the timeline.
- Existing budget plan grid modules (`grid-transforms`, `change-tracker`, related tests) must be retired in favor of the new ledger + projection stack.

## Data Flow
1. Read categories for monthly budgets and display metadata.
2. Read cash-flow ledger entries, splitting projected vs posted amounts by month.
3. Read latest account snapshots to establish starting actual balance.
4. Projection engine builds monthly summary rows: projected income, actual income, projected expenses, actual expenses, projected ending balance, actual ending balance, and variance flags.
5. Timeline UI renders combined chart + table, sourced from the projection engine.
6. Ledger management UI lets users add, duplicate, void, or post entries; posting captures actual amount/date and refreshes the projection output.

## Proposed Modules and Ownership
- **CashFlowRepository — `src/server/google/repository/cash-flow-repository.ts`:** CRUD helpers for the `cash_flows` sheet, including status filters and month aggregation helpers.
- **Projection Engine — `src/server/projection/runway-projection.ts`:** Pure functions that merge categories, cash flows, and snapshots into monthly metrics, returning both chart-ready data and table rows.
- **Timeline API — `src/app/api/runway/route.ts`:** Server handler calling the projection engine and returning JSON for the dashboard.
- **Ledger API — `src/app/api/cash-flows/route.ts`:** CRUD endpoints for planned/posted items.
- **Cash Planner UI — `src/components/cash-planner/*`:** Lists for planned items and posted entries with actions to post, duplicate, or void.
- **Runway Timeline UI — `src/components/runway-timeline/*`:** Combined chart/table visualizing projected vs actual balances and cash.

## Implementation Sequence
1. Define `cash_flows` sheet schema, repository, and tests.
2. Remove legacy budget grid code/tests, replacing with category budget helpers for variance warnings.
3. Build projection engine with tests covering edge cases (missing snapshots, partial months, status transitions).
4. Expose timeline API and integrate into dashboard with new chart/table components.
5. Implement cash planner UI + API flows for managing ledger entries.
6. Wire warnings into category manager and timeline (budget overages, projected depletion date).

## TDD Strategy
- Repository tests for `cash_flows` read/write, status filtering, and validation.
- Projection engine unit tests covering combinations of budgets, planned/posted entries, and snapshots.
- API handler tests stubbing repositories to assert error handling and payload shapes.
- React component tests for ledger interactions (post, duplicate, void) and timeline rendering states.
- E2E-style integration test (server-side) ensuring projection output matches spreadsheet fixtures.

## Open Questions + Assumptions
- Ledger entries can optionally reference an account; initial implementation may leave this null until we wire tighter account links.
- Timeline chart selection (stacked bars + dual line) will be validated once data is available; fallback is table-first UI if chart proves noisy.
