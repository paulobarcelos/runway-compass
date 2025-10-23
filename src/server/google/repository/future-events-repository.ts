// ABOUTME: Loads and persists scheduled income/expense events from the sheet.
// ABOUTME: Validates required scheduling fields and normalizes numeric amounts.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import { FUTURE_EVENTS_SHEET_SCHEMA, dataRange } from "@/server/google/sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  requireNumber,
} from "./sheet-utils";

const FUTURE_HEADERS = FUTURE_EVENTS_SHEET_SCHEMA.headers;
const FUTURE_RANGE = dataRange(FUTURE_EVENTS_SHEET_SCHEMA, 2000);

export interface FutureEventRecord {
  eventId: string;
  type: string;
  accountId: string;
  categoryId: string;
  startMonth: string;
  endMonth: string;
  frequency: string;
  amount: number;
  status: string;
  linkedTransactionId: string;
}

interface FutureEventsRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseFutureEventRow(row: unknown[], rowIndex: number): FutureEventRecord | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    FUTURE_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [
    eventId,
    type,
    accountId,
    categoryId,
    startMonth,
    endMonth,
    frequency,
    amountRaw,
    status,
    linkedTxnId,
  ] = normalized.map((value) => value.trim());

  if (!eventId) {
    throw new Error(`Invalid future event row at index ${rowIndex}: missing event_id`);
  }

  if (!type) {
    throw new Error(`Invalid future event row at index ${rowIndex}: missing type`);
  }

  if (!accountId) {
    throw new Error(`Invalid future event row at index ${rowIndex}: missing account_id`);
  }

  if (!startMonth) {
    throw new Error(`Invalid future event row at index ${rowIndex}: missing start_month`);
  }

  if (!frequency) {
    throw new Error(`Invalid future event row at index ${rowIndex}: missing frequency`);
  }

  if (!status) {
    throw new Error(`Invalid future event row at index ${rowIndex}: missing status`);
  }

  const amount = requireNumber(amountRaw, { field: "amount", rowIndex });

  return {
    eventId,
    type,
    accountId,
    categoryId,
    startMonth,
    endMonth,
    frequency,
    amount,
    status,
    linkedTransactionId: linkedTxnId ?? "",
  };
}

export function createFutureEventsRepository({
  sheets,
  spreadsheetId,
}: FutureEventsRepositoryOptions) {
  return {
    async list(): Promise<FutureEventRecord[]> {
      const response = await executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: FUTURE_RANGE,
        }),
      );

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;
      ensureHeaderRow(headerRow, FUTURE_HEADERS, "future_events");

      const events: FutureEventRecord[] = [];

      for (let index = 0; index < dataRows.length; index += 1) {
        const parsed = parseFutureEventRow(dataRows[index], index + 2);

        if (parsed) {
          events.push(parsed);
        }
      }

      return events;
    },

    async save(records: FutureEventRecord[]) {
      const rows: string[][] = [Array.from(FUTURE_HEADERS) as string[]];

      for (const record of records) {
        rows.push([
          record.eventId,
          record.type,
          record.accountId,
          record.categoryId,
          record.startMonth,
          record.endMonth,
          record.frequency,
          String(record.amount),
          record.status,
          record.linkedTransactionId ?? "",
        ]);
      }

      const range = dataRange(
        FUTURE_EVENTS_SHEET_SCHEMA,
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
