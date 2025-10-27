---
name: spreadsheet-repair-pattern
description: Use when health diagnostics detect missing/drifted tabs/headers — provides explicit repair flow for Runway Compass (no silent bootstrap on load), including API surface and client behavior.
---

# Spreadsheet Repair Pattern (Runway Compass)

## Principles
- Never auto-repair on page load; show blocking issues and require explicit user action
- Support partial repair of a subset of tabs
- Log actions and update manifest timestamps

## API Surface
- POST `/api/spreadsheet/repair`
  - Body: `{ spreadsheetId: string, sheets?: string[] }`
  - Auth: same as bootstrap
  - Validates sheet ids against known schema
  - Reuses bootstrap logic to create headers/tabs for requested subset
  - Returns `{ manifest, repairedSheets }`

## Client Behavior
1. On spreadsheet selection: fetch health; do not auto-bootstrap
2. When issues exist: keep managers read-only and prompt repair
3. Repair button posts to `/api/spreadsheet/repair`; on success, update manifest and refresh health/managers
4. Provide user-visible summary of actions; no silent fixes

## Testing
- Unit: helper deciding when repair is required
- API: missing spreadsheet id, invalid sheet id, partial repair, success path
- Client: managers blocked until repair success; health panel refreshes on manifest change

