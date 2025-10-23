// ABOUTME: Loads and persists transaction rows from the `actuals` sheet.
// ABOUTME: Validates numeric amounts and required transaction fields.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import { ACTUALS_SHEET_SCHEMA, dataRange } from "@/server/google/sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  requireNumber,
} from "./sheet-utils";

const ACTUAL_HEADERS = ACTUALS_SHEET_SCHEMA.headers;
const ACTUAL_RANGE = dataRange(ACTUALS_SHEET_SCHEMA, 3000);

export interface ActualTransaction {
  transactionId: string;
  accountId: string;
  date: string;
  categoryId: string;
  amount: number;
  status: string;
  entryMode: string;
  note: string;
}

interface ActualsRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseActualRow(row: unknown[], rowIndex: number): ActualTransaction | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    ACTUAL_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [
    transactionId,
    accountId,
    date,
    categoryId,
    amountRaw,
    status,
    entryMode,
    note,
  ] = normalized.map((value) => value.trim());

  if (!transactionId) {
    throw new Error(`Invalid actual row at index ${rowIndex}: missing txn_id`);
  }

  if (!accountId) {
    throw new Error(`Invalid actual row at index ${rowIndex}: missing account_id`);
  }

  if (!date) {
    throw new Error(`Invalid actual row at index ${rowIndex}: missing date`);
  }

  if (!status) {
    throw new Error(`Invalid actual row at index ${rowIndex}: missing status`);
  }

  if (!entryMode) {
    throw new Error(`Invalid actual row at index ${rowIndex}: missing entry_mode`);
  }

  const amount = requireNumber(amountRaw, { field: "amount", rowIndex });

  return {
    transactionId,
    accountId,
    date,
    categoryId,
    amount,
    status,
    entryMode,
    note: note ?? "",
  };
}

export function createActualsRepository({
  sheets,
  spreadsheetId,
}: ActualsRepositoryOptions) {
  return {
    async list(): Promise<ActualTransaction[]> {
      const response = await executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: ACTUAL_RANGE,
        }),
      );

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;
      ensureHeaderRow(headerRow, ACTUAL_HEADERS, "actuals");

      const transactions: ActualTransaction[] = [];

      for (let index = 0; index < dataRows.length; index += 1) {
        const parsed = parseActualRow(dataRows[index], index + 2);

        if (parsed) {
          transactions.push(parsed);
        }
      }

      return transactions;
    },

    async save(records: ActualTransaction[]) {
      const rows: string[][] = [Array.from(ACTUAL_HEADERS) as string[]];

      for (const record of records) {
        rows.push([
          record.transactionId,
          record.accountId,
          record.date,
          record.categoryId,
          String(record.amount),
          record.status,
          record.entryMode,
          record.note ?? "",
        ]);
      }

      const range = dataRange(
        ACTUALS_SHEET_SCHEMA,
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
