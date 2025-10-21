// ABOUTME: Loads and persists budget plan rows keyed by category and month.
// ABOUTME: Validates numeric fields and normalizes rollover balances.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "../retry";
import { BUDGET_PLAN_SHEET_SCHEMA, dataRange } from "../sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  optionalNumber,
  requireInteger,
  requireNumber,
} from "./sheet-utils";

const BUDGET_PLAN_HEADERS = BUDGET_PLAN_SHEET_SCHEMA.headers;
const BUDGET_PLAN_RANGE = dataRange(BUDGET_PLAN_SHEET_SCHEMA, 2000);

export interface BudgetPlanRecord {
  recordId: string;
  categoryId: string;
  month: number;
  year: number;
  amount: number;
  rolloverBalance: number;
}

interface BudgetPlanRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseBudgetRow(row: unknown[], rowIndex: number): BudgetPlanRecord | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    BUDGET_PLAN_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [recordId, categoryId, monthRaw, yearRaw, amountRaw, rolloverRaw] = normalized.map(
    (value) => value.trim(),
  );

  if (!recordId) {
    throw new Error(`Invalid budget plan row at index ${rowIndex}: missing record_id`);
  }

  if (!categoryId) {
    throw new Error(`Invalid budget plan row at index ${rowIndex}: missing category_id`);
  }

  const month = requireInteger(monthRaw, { field: "month", rowIndex });
  const year = requireInteger(yearRaw, { field: "year", rowIndex });
  const amount = requireNumber(amountRaw, { field: "amount", rowIndex });
  const rolloverBalance = optionalNumber(
    rolloverRaw,
    { field: "rollover_balance", rowIndex },
    0,
  );

  return {
    recordId,
    categoryId,
    month,
    year,
    amount,
    rolloverBalance,
  };
}

export function createBudgetPlanRepository({
  sheets,
  spreadsheetId,
}: BudgetPlanRepositoryOptions) {
  return {
    async list(): Promise<BudgetPlanRecord[]> {
      const response = await executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: BUDGET_PLAN_RANGE,
        }),
      );

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;

      ensureHeaderRow(headerRow, BUDGET_PLAN_HEADERS, "budget_plan");

      const records: BudgetPlanRecord[] = [];

      for (let index = 0; index < dataRows.length; index += 1) {
        const parsed = parseBudgetRow(dataRows[index], index + 2);

        if (parsed) {
          records.push(parsed);
        }
      }

      return records;
    },

    async save(records: BudgetPlanRecord[]) {
      const rows: string[][] = [Array.from(BUDGET_PLAN_HEADERS) as string[]];

      for (const record of records) {
        rows.push([
          record.recordId,
          record.categoryId,
          String(record.month),
          String(record.year),
          String(record.amount),
          String(record.rolloverBalance),
        ]);
      }

      const range = dataRange(
        BUDGET_PLAN_SHEET_SCHEMA,
        Math.max(records.length + 1, 1),
      );

      await executeWithRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: "RAW",
          resource: {
            values: rows,
          },
        }),
      );
    },
  };
}
