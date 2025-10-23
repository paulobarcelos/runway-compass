// ABOUTME: Summarizes Budget Planner milestone scope and sequencing.
// ABOUTME: Guides implementation of budget plan grid across API, logic, and UI.

# Budget Planner Milestone Plan

## Scope
- Deliver an editable budget plan grid that displays categories versus a rolling month horizon sourced from Google Sheets.
- Reuse `/api/categories` and `/api/budget-plan` for read/write flows, including manifest-driven spreadsheet selection and health gating.
- Provide client-side normalization, validation, and save orchestration for monthly amounts while computing rollover balances automatically.
- Render amounts in the base currency via `useBaseCurrency`, labeling approximated conversions when category currencies differ.

## Decisions
- Horizon: use a rolling 12-month window anchored to the current calendar month.
- Rollover balances: compute automatically; users never edit rollover cells directly.
- Blank months: seed default amounts from each category `monthlyBudget`.
- Currency: keep category edits in their native currency; render converted amounts only for base currency views.
- Visibility: show every category without filters.
- Saves: POST the full dataset on save; skip diff batching.
- Projection: do not trigger an immediate runway rebuild after save.

## Out of Scope
- Changing category CRUD, category monthly budget inputs, or sort order behavior.
- Implementing projection updates, variance analytics, or future event integrations tied to budget edits.
- Introducing new currency conversion providers or persistent user preferences beyond the existing base currency context.
- Building drag-and-drop ordering, multi-scenario toggles, or collaborative editing features.

## Current State Snapshot
- `src/app/api/categories/route.ts` validates spreadsheet access, normalizes `CategoryRecord` data, and already powers the category manager.
- `src/app/api/budget-plan/route.ts` exposes list/save handlers backed by `createBudgetPlanRepository`, enforcing schema headers and numeric validation.
- Repositories in `src/server/google/repository/` handle Google Sheets I/O with retry logic and are covered by Node test suites under `tests/`.
- The client lacks any consumer of budget plan data; `CategoryManager` demonstrates the manifest + health + base currency pattern we can mirror.

## Data Flow
1. The budget planner hook reads `spreadsheetId` from `loadManifest` once the dashboard detects a healthy spreadsheet via `useSpreadsheetHealth`.
2. Call `/api/categories?spreadsheetId=` to obtain ordered category metadata (labels, rollover flags, monthlyBudget, currencyCode).
3. Call `/api/budget-plan?spreadsheetId=` to retrieve existing `BudgetPlanRecord` entries.
4. Merge categories and budget plan records into a 12-month rolling grid keyed by `categoryId` × `month/year`, seeding blank months from `monthlyBudget` defaults and computing rollovers automatically.
5. Track user amount edits locally while recomputing derived rollovers for rows with `rolloverFlag = true`.
6. Serialize the current grid into a full `BudgetPlanRecord[]`, generating deterministic IDs for new records to keep sheet rows stable.
7. POST the full normalized payload to `/api/budget-plan`; on success, update the local baseline and surface confirmation.
8. Surface errors via inline messaging and the existing spreadsheet health banner when Sheets operations fail (auth, header mismatch, etc.).

## Proposed Modules and Ownership
- **Domain transforms — `src/lib/budget-plan/grid-transforms.ts`:** Pure functions to merge category metadata with `BudgetPlanRecord` data, apply monthly defaults, compute the rolling horizon, recompute rollovers, and emit a presentational view model.
- **Change tracking — `src/lib/budget-plan/change-tracker.ts`:** Utilities to compare original versus draft grids, validate numeric inputs, enforce computed rollover rules, and emit a full `BudgetPlanRecord[]` for save operations.
- **API helpers — `src/lib/api/budget-plan-client.ts`:** `fetchBudgetPlan(spreadsheetId)` and `saveBudgetPlan(spreadsheetId, records)` functions wrapping `fetch`, mapping non-200 responses to actionable errors.
- **State hook — `src/components/budget-plan/use-budget-plan-manager.ts`:** Orchestrates manifest lookup, health gating, data fetching, transforms, dirty-state tracking, and save triggers; exposes actions (`setAmount`, `setRollover`, `appendMonth`, `save`).
- **UI components — `src/components/budget-plan/budget-plan-grid.tsx`:** Presentational table rendering month headers, category rows, rollover indicators, save/undo controls, and error states via props supplied by the state hook.
- **Page wiring — integrate** the new manager/grid into the dashboard route, keeping other managers untouched and respecting layout conventions.

## Implementation Sequence
1. Build `grid-transforms.ts` and `change-tracker.ts`, including exhaustive unit tests to lock data shapes before UI work.
2. Add `budget-plan-client.ts` with fetch/save wrappers plus tests covering success and failure paths.
3. Implement `use-budget-plan-manager.ts`, substituting stub clients in tests to verify load, error, and save flows.
4. Assemble `BudgetPlanGrid` UI components, relying on the tested hook for behavior and performing manual QA for styling/accessibility.
5. Wire the planner into the dashboard behind existing health checks, ensuring manifest updates trigger downstream reloads.

## TDD Strategy
- `tests/budget-plan-grid-transforms.test.cjs`: Validate category sorting, default month seeding, automatic 12-month horizon building, rollover calculations, and deterministic record IDs emitted by `grid-transforms`.
- `tests/budget-plan-change-tracker.test.cjs`: Cover validation rules (finite numbers, computed rollover propagation), dirty detection, and serialization of the full dataset back to `BudgetPlanRecord[]`.
- `tests/budget-plan-client.test.cjs`: Stub `global.fetch` to confirm request URLs, payload shapes, and error mapping for auth and Sheets failures.
- `tests/use-budget-plan-manager.test.cjs`: Use fake client implementations to assert loading state transitions, error propagation, dirty-state resets after saves, and append-month behavior without rendering DOM.

## Open Questions + Assumptions
- None; decisions above cover previously open items.
