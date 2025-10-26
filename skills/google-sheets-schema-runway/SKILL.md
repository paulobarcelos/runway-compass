---
name: google-sheets-schema-runway
description: Use when reading/writing the project spreadsheet — defines the exact tabs, headers, and invariants for Runway Compass (categories, accounts, snapshots, cash_flows, runway_projection, _meta) plus bootstrap/validation expectations.
---

# Runway Compass Spreadsheet Schema

## Tabs & Headers
- categories: `category_id, label, color, monthly_budget, sort_order`
- accounts: `account_id, name, type, currency, include_in_runway, sort_order, last_snapshot_at`
- snapshots: `snapshot_id, account_id, date, balance, note`
- cash_flows: `flow_id, type, category_id, planned_date, planned_amount, actual_date, actual_amount, status, account_id, note`
- runway_projection: `month, year, starting_balance, income_total, expense_total, ending_balance, stoplight_status, notes`
- _meta: key/value pairs including `selected_spreadsheet_id, schema_version, last_migration_at`

## Invariants
- Header row (row 1) must exactly match; data starts at row 2
- `status` in `cash_flows` ∈ {`planned`,`posted`,`void`}
- `include_in_runway` is boolean-like (TRUE/FALSE)
- IDs are opaque strings (do not infer semantics)

## Bootstrap & Validation
- Bootstrap creates all tabs with headers exactly as listed
- Validation runs on each session start:
  - verify tab presence
  - verify header equality
  - record manifest in `_meta`
- On mismatch, surface a blocking health issue (do not auto-fix silently)

## Projection Inputs/Outputs (overview)
- Inputs: category budgets, cash_flows, snapshots, accounts filters
- Output: `runway_projection` with stoplight by month

## Repair (see local skill)
- Use the local `spreadsheet-repair-pattern` skill for explicit repair semantics and API endpoints

