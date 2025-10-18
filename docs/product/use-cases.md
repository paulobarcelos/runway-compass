# Runway Compass – Core Use Cases

## UC-01: Set Up Spreadsheet
1. Sign in with Google and authorize required scopes.
2. Select or create a spreadsheet via Google Picker.
3. App seeds required tabs if missing and stores manifest in `_meta`.

## UC-02: Configure Categories and Budgets
1. User defines/edit spending categories (e.g., Transport, Groceries, Trips).
2. Enter annual allocation per category; app distributes across months.
3. Adjust monthly values when needed; unused funds roll to subsequent months.

## UC-03: Manage Accounts and Snapshots
1. Create records for main bank, secondary accounts, and cash.
2. Capture monthly balance snapshot for each account; ad-hoc updates allowed for cash.
3. Review historical snapshots to understand drift from projections.

## UC-04: Log Actual Transactions
1. For each account, input transactions with date, amount, category, and notes.
2. Mark transactions as `posted` once reconciled with the bank or cash ledger.
3. View monthly totals vs budget and identify variances.

## UC-05: Schedule Future Events
1. Record known future income (e.g., unemployment benefits) or expenses (e.g., travel booking).
2. Specify frequency (one-off, recurring monthly) and associated account/category.
3. When the event occurs, convert to an actual transaction and mark the event as complete.

## UC-06: Review Runway Projection
1. App combines budgets, actuals, snapshots, and future events to forecast balances.
2. Display timeline with green/yellow/red status per month.
3. Highlight milestones: income no longer covers spend, savings depletion month, projected runway end.

## UC-07: Adjust Plan Based on Variance
1. Compare monthly actuals vs budget to identify over/under spend.
2. Modify future budget allocations or planned events accordingly.
3. Re-run projection to confirm updated runway outlook.

## UC-08: Multi-Device Continuity
1. User signs in from another device.
2. App retrieves stored manifest, reconnects to the same spreadsheet, and reloads data.
3. User continues workflows without manual reconfiguration.

