// ABOUTME: Captures requirements for intentional spreadsheet repair workflows.
// ABOUTME: Guides future implementation of manual bootstrapping and repair tooling.

# Spreadsheet Repair Flow Specification

## Problem
- Current connect card auto-bootstraps the spreadsheet each time the manifest changes or the page reloads.
- A missing sheet triggers a health error, but a full reload silently recreates the sheet via bootstrap before the user sees the warning.
- Paulo wants repairs to be intentional actions initiated by the user (e.g., via a "Repair" button), not implicit side effects of loading the dashboard.

## Goals
1. Preserve frictionless onboarding for newly created spreadsheets.
2. Prevent automatic repairs for established spreadsheets so users can inspect health issues before altering Google Sheets.
3. Provide an explicit repair control that can re-bootstrap individual tabs or the entire workbook.
4. Keep managers locked/read-only when blocking errors exist until a repair succeeds.
5. Ensure repair operations are observable (UX feedback + logging).

## Non-goals
- Building the repair UI itself in this iteration.
- Implementing granular cell-level fixes; scope is sheet/tabs bootstrap.
- Handling quota/rate-limit escalation beyond existing retry helpers.

## User Stories
1. As a user connecting a brand-new spreadsheet, I expect the app to create required tabs automatically so I can start editing immediately.
2. As a user loading an existing spreadsheet, if a tab is missing or corrupted I expect the app to show the issue and offer a repair button instead of silently recreating tabs.
3. As a user viewing the health panel, I want a clear “Repair” action that restarts the bootstrap for the impacted sheet(s) and refreshes diagnostics afterward.

## High-level Flow
### New spreadsheet creation / selection
1. User creates spreadsheet through “Create spreadsheet” flow → server bootstrap runs automatically (no change).
2. User selects an existing spreadsheet:
   - Connect card registers spreadsheet but **does not** auto-bootstrap.
   - Immediately fetch health diagnostics.
   - If diagnostics show blocking issues, managers stay read-only and prompt the user to run repair.
   - If diagnostics are clean, managers fetch their data.

### Repair button
1. User clicks “Repair” in the health panel.
2. Client posts to a new `/api/spreadsheet/repair` endpoint with:
   - `spreadsheetId`
   - optional `sheetIds` (e.g., `["categories"]`); default is all required sheets.
3. Server reuses bootstrap logic to recreate missing tabs and headers for the specified subset, without touching other sheets.
4. Server returns updated manifest metadata (`storedAt`, `bootstrappedAt`) and a summary of actions performed.
5. Client updates manifest, triggers health reload, and managers refetch through existing hooks.
6. UI shows success or detailed error if bootstrap failed; no silent recovery.

### Page reload when issues persist
- Loading dashboard skips auto-bootstrap.
- Managers rely on health diagnostics to remain blocked.
- User must run repair explicitly; no background bootstrap on load.

## API Changes
- **New** `POST /api/spreadsheet/repair`
  - Body: `{ spreadsheetId: string, sheets?: string[] }`
  - Auth: same as existing bootstrap endpoint.
  - Behavior:
    - Validate requested sheets against known schema IDs.
    - Call `bootstrapSpreadsheet` with filtered schema list.
    - Return `{ manifest: {...}, repairedSheets: string[] }`.
- **Existing** `/api/spreadsheet/bootstrap`
  - Remains for initial creation flow.
  - Update connect card to call only during create flow or after explicit “Bootstrap all” action.

## Client Changes
1. **Manifest sync**
   - Connect card stops auto-posting to `/api/spreadsheet/bootstrap` when existing manifest is present.
   - Track whether the selected spreadsheet has ever been bootstrapped; only run automatically immediately after creation.

2. **Health panel**
   - Enable the “Repair” button.
   - If user selects issues from a single sheet card, offer contextual repair (pass `sheetId` list). Otherwise default to all sheets.
   - Show progress state while awaiting repair response.

3. **Managers**
   - Continue using manifest `storedAt` hook to detect repair completion (already in place).
   - After repair success, reload even if health panel has not re-run yet (rely on storedAt change).

4. **UX Feedback**
   - Banner/toast summarizing repair results.
   - Improved error messaging when repair fails (keep fields locked).

## Telemetry / Logging
- Log repair requests (sheet IDs, actor) server-side via existing `debugLog` or future audit mechanisms.
- Emit front-end console debug logs for traceability during manual testing.

## Security / Permissions
- Repair shares the same Google scopes as bootstrap (no extra requirements).
- Ensure the API validates sheet IDs to avoid arbitrary range writes.

## Testing Strategy
- Unit tests for helper deciding when repair is required.
- API tests for `/api/spreadsheet/repair` covering:
  - Missing spreadsheet ID.
  - Invalid sheet ID.
  - Partial repairs (single sheet).
  - Successful manifest update.
- Client tests (once framework available) to confirm:
  - Repair triggers fetch and updates health panel.
  - Managers stay blocked until repair success.

## Open Questions
1. Should the repair modal allow users to pick specific sheets, or do we auto-select based on current health issues?
2. Do we need rate limiting or confirmation prompts before overwriting headers?
3. How should we surface partial repair failures (e.g., one sheet fixed, another fails)?

## Next Steps
1. Update connect card to differentiate between “new spreadsheet” and “existing spreadsheet” flows.
2. Implement `/api/spreadsheet/repair`.
3. Wire the health panel repair button to the new endpoint.
4. Add comprehensive logging and tests per the strategy above.
