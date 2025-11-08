# Manager Route Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Accounts, Budget Plan, Ledger, and Runway managers onto dedicated routes and leave the dashboard empty.

**Architecture:** Each manager page will live under `src/app/(authenticated)/managers` and export `withManagerPrefetch` so `ManagersLayout` can hydrate data. The dashboard root will render only the layout shell with no embedded managers. Navigation will list all manager routes, marking Runway as "Soon" until its view exists.

**Tech Stack:** Next.js App Router, React Server Components, existing ManagerChrome layout, React Query prefetch helpers.

### Task 1: Accounts manager route

**Files:**
- Create: `src/app/(authenticated)/managers/accounts/page.tsx`

1. Scaffold `managerPrefetch` that currently no-ops (Accounts loads client-side). Export page via `withManagerPrefetch` returning `<AccountsManager />`.
2. Ensure default export matches conventions used in categories route.

### Task 2: Budget Plan manager route

**Files:**
- Create: `src/app/(authenticated)/managers/budget-plan/page.tsx`

1. Import `getBudgetPlan`, `queryKeys`, and `<BudgetPlanManager />`.
2. Implement `managerPrefetch` mirroring the dashboard logic (prefetch `queryKeys.budgetPlan`).
3. Export the page through `withManagerPrefetch`.

### Task 3: Ledger manager route

**Files:**
- Create: `src/app/(authenticated)/managers/ledger/page.tsx`

1. Add placeholder `managerPrefetch` (ledger data is loaded by hooks at runtime).
2. Render `<CashPlannerManager />` via `withManagerPrefetch`.

### Task 4: Runway manager placeholder

**Files:**
- Create: `src/app/(authenticated)/managers/runway/page.tsx`

1. Export a static section announcing "Runway timeline coming soon" through `withManagerPrefetch` (no prefetch function needed).

### Task 5: Navigation updates

**Files:**
- Modify: `src/components/navigation/manager-navigation.tsx`

1. Replace `DEFAULT_ITEMS` with ordered entries: Dashboard, Categories, Accounts, Budget Plan, Ledger, Runway.
2. Remove `disabled` from Accounts/Budget/Ledger; keep Runway flagged as "Soon".

### Task 6: Empty dashboard

**Files:**
- Modify: `src/app/page.tsx`

1. Remove manager imports and prefetch logic; keep session + query client wiring only if still needed.
2. Render an empty main stack (e.g., a short neutral message) so layout persists but no embedded managers remain.

### Task 7: Verification

**Commands:**
1. `npm run lint`
2. `npm test`
3. `npm run build`

Record any failures and address regressions before finishing.
