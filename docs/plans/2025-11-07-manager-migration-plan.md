## 2025-11-07 – Unified Manager Migration & Routing Plan

### Goals
- Migrate every remaining manager (Categories for routing template, Accounts + Snapshots, Budget Plan, Cash Planner) onto the TanStack Query/server-action stack with consistent autosave + offline behavior.
- Carve each manager into its own App Router segment while keeping shared providers (auth session, spreadsheet connection/health, base currency) centralized.
- Remove or hide Runway Timeline until its redesign (Issue #113 follow-up).

### Shared UX / Architecture Decisions
1. **Common header block** (componentize if needed):
   - Title + status pill (`Loading…`, `Offline`, etc.)
   - “Open sheet” button linking to the relevant tab (`buildSheetUrl` + sheet gid).
   - Sync indicator (last saved timestamp + offline queue state).
2. **Autosave parity**:
   - No manual “Save changes” buttons; use offline queue + TanStack mutations for every manager.
   - Background refresh intervals: 60 s for lightweight lists (categories/accounts), 30 s for grid-heavy data (budget plan/ledger). All use `useSheetInvalidation`.
3. **Server actions** only: retire legacy `/api/...` fetch helpers inside components; routes delegate to shared handlers where external callers still need them.
4. **Routing shell**:
   - `/app/(authenticated)/layout.tsx` stays the provider shell (session, query hydration, base currency, spreadsheet health).
   - Each manager lives under `/app/(authenticated)/manager/<name>/page.tsx` and uses the same Providers via layout nesting.

### Work Breakdown (Sequence)

#### 0. Template + Utilities
- Extract a shared `<ManagerHeader>` component encapsulating title/status, sheet link, last-saved, and optional action slots.
- Extend `useSheetInvalidation`/`useOfflineMutationQueue` helpers as needed (e.g., optional `statusText`, queue reset already in place).
- Document coding conventions (autosave pattern, offline toasts) in `docs/` for future managers.

#### 1. Categories Route (template pilot)
1. Move existing categories UI into `/app/(authenticated)/managers/categories/page.tsx`.
2. Add a navigation entry (temporary) linking from the dashboard while both views coexist.
3. Ensure hydration works when visiting the standalone URL (server prefetch + providers).
4. Once stable, remove the dashboard’s embedded categories section.

#### 2. Accounts Manager (with Snapshots)
1. **Server actions**: create `accounts-actions.ts` mirroring categories/budget plan (list + mutate + optional snapshot endpoints).
2. **Hook**: `use-accounts.ts` providing TanStack Query integration, optimistic autosave, nested snapshot helpers.
3. **Component refactor**: account table uses the hook; snapshot modal (if any) uses the same cache.
4. **Routing**: new `/managers/accounts` page, same header component.
5. **Legacy cleanup**: remove old fetch/autosave timers, ensure `/api/accounts` delegates to the new actions.
6. **Tests**: actions, hook (optimistic + offline queue), snapshot interactions.

#### 3. Budget Plan Harmonization
1. Remove the “Save changes” button; switch to continuous autosave (same pattern as categories).
2. Split into `/managers/budget-plan` route.
3. Ensure horizon controls still work; grid totals recompute via hook state.
4. Tests: update existing RTL suite for autosave semantics + offline queue reset.

#### 4. Cash Planner (“Ledger”)
1. Server actions + hook (entries list, create/update/delete, metadata) using TanStack Query.
2. Replace bespoke autosave/debounce logic with the shared queue + invalidation.
3. Route `/managers/ledger`.
4. Tests for optimistic row edits, rollback, background refresh.

#### 5. Runway Timeline
1. Remove/hide current manager from dashboard; leave a placeholder route or link to upcoming redesign.
2. Ensure navigation doesn’t reference it until Issue 113 redesign is ready.

#### 6. Dashboard Cleanup & Navigation
1. Update main page to show only high-level cards linking to each manager route (plus spreadsheet health summary).
2. Add top-level nav or sidebar if needed (future Issue 113 may formalize this).

### Verification Checklist per Manager
- `npm run lint`
- `npm test` (ensure new suites added)
- `npm run build`
- Manual smoke: load route, edit online/offline, confirm background refresh + cross-tab behavior

### Deliverables
1. Code changes per manager (server actions, hooks, components, routes, tests).
2. Documentation updates (`docs/` or README) describing the unified pattern.
3. PR updates after each manager batch (status table + summary comment).
