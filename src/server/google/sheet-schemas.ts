// ABOUTME: Lists required Google Sheets tabs and column headers.
// ABOUTME: Provides helpers for computing header ranges and column spans.
import type { sheets_v4 } from "googleapis";

export interface SheetSchema {
  title: string;
  headers: readonly string[];
  hidden?: boolean;
  gridProperties?: sheets_v4.Schema$GridProperties;
  freezeHeader?: boolean;
}

export const META_SHEET_TITLE = "_meta";
export const META_HEADERS = ["key", "value"] as const;

const DEFAULT_GRID_ROWS = 200;
const META_DEFAULT_ROWS = 20;

export const REQUIRED_SHEETS: SheetSchema[] = [
  {
    title: META_SHEET_TITLE,
    headers: META_HEADERS,
    hidden: true,
    gridProperties: {
      rowCount: META_DEFAULT_ROWS,
      columnCount: META_HEADERS.length,
      frozenRowCount: 0,
    },
    freezeHeader: false,
  },
  {
    title: "categories",
    headers: [
      "category_id",
      "label",
      "color",
      "rollover_flag",
      "sort_order",
      "monthly_budget",
      "currency_code",
    ],
    gridProperties: {
      rowCount: DEFAULT_GRID_ROWS,
      columnCount: 12,
      frozenRowCount: 1,
    },
    freezeHeader: true,
  },
  {
    title: "accounts",
    headers: [
      "account_id",
      "name",
      "type",
      "currency",
      "include_in_runway",
      "sort_order",
      "last_snapshot_at",
    ],
    gridProperties: {
      rowCount: DEFAULT_GRID_ROWS,
      columnCount: 12,
      frozenRowCount: 1,
    },
    freezeHeader: true,
  },
  {
    title: "snapshots",
    headers: ["snapshot_id", "account_id", "date", "balance", "note"],
    gridProperties: {
      rowCount: DEFAULT_GRID_ROWS,
      columnCount: 10,
      frozenRowCount: 1,
    },
    freezeHeader: true,
  },
  {
    title: "budget_plan",
    headers: [
      "record_id",
      "category_id",
      "month",
      "year",
      "amount",
      "rollover_balance",
    ],
    gridProperties: {
      rowCount: DEFAULT_GRID_ROWS,
      columnCount: 12,
      frozenRowCount: 1,
    },
    freezeHeader: true,
  },
  {
    title: "actuals",
    headers: [
      "txn_id",
      "account_id",
      "date",
      "category_id",
      "amount",
      "status",
      "entry_mode",
      "note",
    ],
    gridProperties: {
      rowCount: DEFAULT_GRID_ROWS,
      columnCount: 16,
      frozenRowCount: 1,
    },
    freezeHeader: true,
  },
  {
    title: "future_events",
    headers: [
      "event_id",
      "type",
      "account_id",
      "category_id",
      "start_month",
      "end_month",
      "frequency",
      "amount",
      "status",
      "linked_txn_id",
    ],
    gridProperties: {
      rowCount: DEFAULT_GRID_ROWS,
      columnCount: 16,
      frozenRowCount: 1,
    },
    freezeHeader: true,
  },
  {
    title: "runway_projection",
    headers: [
      "month",
      "year",
      "starting_balance",
      "income_total",
      "expense_total",
      "ending_balance",
      "stoplight_status",
      "notes",
    ],
    gridProperties: {
      rowCount: DEFAULT_GRID_ROWS,
      columnCount: 16,
      frozenRowCount: 1,
    },
    freezeHeader: true,
  },
];

REQUIRED_SHEETS.forEach((schema) => Object.freeze(schema.headers));

function requireSchema(title: string) {
  const schema = REQUIRED_SHEETS.find((item) => item.title === title);

  if (!schema) {
    throw new Error(`Sheet schema not defined for ${title}`);
  }

  return schema;
}

export const META_SHEET_SCHEMA = requireSchema("_meta");
export const CATEGORIES_SHEET_SCHEMA = requireSchema("categories");
export const ACCOUNTS_SHEET_SCHEMA = requireSchema("accounts");
export const BUDGET_PLAN_SHEET_SCHEMA = requireSchema("budget_plan");
export const SNAPSHOTS_SHEET_SCHEMA = requireSchema("snapshots");
export const ACTUALS_SHEET_SCHEMA = requireSchema("actuals");
export const FUTURE_EVENTS_SHEET_SCHEMA = requireSchema("future_events");
export const RUNWAY_PROJECTION_SHEET_SCHEMA = requireSchema("runway_projection");

export function columnIndexToLetter(index: number) {
  if (index <= 0) {
    throw new Error("Column index must be positive");
  }

  let result = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

export function headerRange(schema: SheetSchema) {
  const lastColumn = columnIndexToLetter(schema.headers.length);
  return `${schema.title}!A1:${lastColumn}1`;
}

export function dataRange(schema: SheetSchema, rowCount: number) {
  const lastColumn = columnIndexToLetter(schema.headers.length);
  const rows = Math.max(rowCount, 1);
  return `${schema.title}!A1:${lastColumn}${rows}`;
}

export function sheetPropertiesFor(
  schema: SheetSchema,
): sheets_v4.Schema$SheetProperties {
  const gridProperties: sheets_v4.Schema$GridProperties = {
    rowCount: schema.hidden ? META_DEFAULT_ROWS : DEFAULT_GRID_ROWS,
    columnCount: Math.max(
      schema.headers.length,
      schema.gridProperties?.columnCount ?? schema.headers.length,
    ),
    frozenRowCount: schema.freezeHeader ? 1 : 0,
    ...schema.gridProperties,
  };

  if (schema.freezeHeader && gridProperties.frozenRowCount === undefined) {
    gridProperties.frozenRowCount = 1;
  }

  return {
    title: schema.title,
    sheetType: "GRID",
    hidden: schema.hidden ?? false,
    gridProperties,
  };
}
