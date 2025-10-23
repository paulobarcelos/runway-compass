// ABOUTME: Loads and persists cash-flow ledger rows from the `cash_flows` sheet.
// ABOUTME: Provides status filtering and monthly aggregation helpers for ledger entries.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import {
  CASH_FLOWS_SHEET_SCHEMA,
  dataRange,
} from "@/server/google/sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  requireNumber,
} from "./sheet-utils";

const CASH_FLOW_HEADERS = CASH_FLOWS_SHEET_SCHEMA.headers;
const CASH_FLOW_RANGE = dataRange(CASH_FLOWS_SHEET_SCHEMA, 4000);

const VALID_STATUSES = new Set(["planned", "posted", "void"] as const);
const VALID_TYPES = new Set(["income", "expense"] as const);

export type CashFlowStatus = "planned" | "posted" | "void";
export type CashFlowType = "income" | "expense";

export interface CashFlowEntry {
  flowId: string;
  type: CashFlowType;
  categoryId: string;
  plannedDate: string;
  plannedAmount: number;
  actualDate: string | null;
  actualAmount: number | null;
  status: CashFlowStatus;
  accountId: string | null;
  note: string;
}

interface CashFlowRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseCashFlowRow(row: unknown[], rowIndex: number): CashFlowEntry | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    CASH_FLOW_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [
    flowIdRaw,
    typeRaw,
    categoryIdRaw,
    plannedDateRaw,
    plannedAmountRaw,
    actualDateRaw,
    actualAmountRaw,
    statusRaw,
    accountIdRaw,
    noteRaw,
  ] = normalized;

  const flowId = flowIdRaw.trim();

  if (!flowId) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing flow_id`);
  }

  const typeNormalized = typeRaw.trim().toLowerCase();

  if (!typeNormalized) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing type`);
  }

  if (!VALID_TYPES.has(typeNormalized as CashFlowType)) {
    throw new Error(
      `Invalid cash flow row at index ${rowIndex}: type must be income or expense`,
    );
  }

  const categoryId = categoryIdRaw.trim();

  if (!categoryId) {
    throw new Error(
      `Invalid cash flow row at index ${rowIndex}: missing category_id`,
    );
  }

  const plannedDate = plannedDateRaw.trim();

  if (!plannedDate) {
    throw new Error(
      `Invalid cash flow row at index ${rowIndex}: missing planned_date`,
    );
  }

  const plannedAmount = requireNumber(plannedAmountRaw, {
    field: "planned_amount",
    rowIndex,
  });

  const statusNormalized = statusRaw.trim().toLowerCase();

  if (!statusNormalized) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing status`);
  }

  if (!VALID_STATUSES.has(statusNormalized as CashFlowStatus)) {
    throw new Error(
      `Invalid cash flow row at index ${rowIndex}: status must be planned, posted, or void`,
    );
  }

  const actualDateTrimmed = actualDateRaw.trim();
  const actualDate = actualDateTrimmed ? actualDateTrimmed : null;

  const actualAmountTrimmed = actualAmountRaw.trim();
  let actualAmount: number | null = null;

  if (actualAmountTrimmed) {
    const parsed = Number(actualAmountTrimmed);

    if (Number.isNaN(parsed)) {
      throw new Error(
        `Invalid cash flow row at index ${rowIndex}: actual_amount must be a number`,
      );
    }

    actualAmount = parsed;
  }

  const accountIdTrimmed = accountIdRaw.trim();
  const accountId = accountIdTrimmed ? accountIdTrimmed : null;
  const note = (noteRaw ?? "").trim();

  return {
    flowId,
    type: typeNormalized as CashFlowType,
    categoryId,
    plannedDate,
    plannedAmount,
    actualDate,
    actualAmount,
    status: statusNormalized as CashFlowStatus,
    accountId,
    note,
  };
}

function extractMonth(value: string | null | undefined) {
  const normalized = (value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4}-\d{2})/);

  if (!match) {
    return null;
  }

  return match[1];
}

export interface MonthlyCashFlowSummary {
  month: string;
  plannedIncome: number;
  plannedExpense: number;
  postedIncome: number;
  postedExpense: number;
}

export function summarizeCashFlowsByMonth(entries: CashFlowEntry[]) {
  const accumulator = new Map<string, MonthlyCashFlowSummary>();

  type MonthlySummaryField = Exclude<keyof MonthlyCashFlowSummary, "month">;

  function add(month: string | null, field: MonthlySummaryField, amount: number) {
    if (!month) {
      return;
    }

    let bucket = accumulator.get(month);

    if (!bucket) {
      bucket = {
        month,
        plannedIncome: 0,
        plannedExpense: 0,
        postedIncome: 0,
        postedExpense: 0,
      };
      accumulator.set(month, bucket);
    }

    bucket[field] += amount;
  }

  for (const entry of entries) {
    if (entry.status === "void") {
      continue;
    }

    if (entry.status === "planned") {
      const month = extractMonth(entry.plannedDate);
      const field = entry.type === "income" ? "plannedIncome" : "plannedExpense";
      add(month, field, entry.plannedAmount);
      continue;
    }

    const actualMonth =
      extractMonth(entry.actualDate) ?? extractMonth(entry.plannedDate);
    const actualAmount =
      entry.actualAmount != null ? entry.actualAmount : entry.plannedAmount;
    const field = entry.type === "income" ? "postedIncome" : "postedExpense";
    add(actualMonth, field, actualAmount);
  }

  const ordered = Array.from(accumulator.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return new Map<string, MonthlyCashFlowSummary>(ordered);
}

export function createCashFlowRepository({
  sheets,
  spreadsheetId,
}: CashFlowRepositoryOptions) {
  async function loadEntries() {
    const response = await executeWithRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: CASH_FLOW_RANGE,
      }),
    );

    const rows = (response.data.values as unknown[][] | undefined) ?? [];

    if (rows.length === 0) {
      return [] as CashFlowEntry[];
    }

    const [headerRow, ...dataRows] = rows;

    ensureHeaderRow(headerRow, CASH_FLOW_HEADERS, "cash_flows");

    const entries: CashFlowEntry[] = [];

    for (let index = 0; index < dataRows.length; index += 1) {
      const parsed = parseCashFlowRow(dataRows[index], index + 2);

      if (parsed) {
        entries.push(parsed);
      }
    }

    return entries;
  }

  return {
    async list(): Promise<CashFlowEntry[]> {
      return loadEntries();
    },

    async listByStatus(statuses: readonly CashFlowStatus[]) {
      if (!Array.isArray(statuses) || statuses.length === 0) {
        return [] as CashFlowEntry[];
      }

      const allowed = new Set(
        statuses.map((status) => status.toLowerCase() as CashFlowStatus),
      );

      const entries = await loadEntries();
      return entries.filter((entry) => allowed.has(entry.status));
    },

    async save(records: CashFlowEntry[]) {
      const rows: string[][] = [Array.from(CASH_FLOW_HEADERS) as string[]];

      for (const record of records) {
        rows.push([
          record.flowId,
          record.type,
          record.categoryId,
          record.plannedDate,
          String(record.plannedAmount),
          record.actualDate ?? "",
          record.actualAmount != null ? String(record.actualAmount) : "",
          record.status,
          record.accountId ?? "",
          record.note ?? "",
        ]);
      }

      const range = dataRange(
        CASH_FLOWS_SHEET_SCHEMA,
        Math.max(records.length + 1, 1),
      );

      await executeWithRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: "RAW",
          requestBody: {
            values: rows,
          },
        }),
      );
    },
  };
}
