// ABOUTME: Loads and saves account snapshot rows from the `snapshots` sheet.
// ABOUTME: Ensures balances parse to numbers and notes default to empty strings.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import { SNAPSHOTS_SHEET_SCHEMA, dataRange } from "@/server/google/sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  requireNumber,
} from "./sheet-utils";

const SNAPSHOT_HEADERS = SNAPSHOTS_SHEET_SCHEMA.headers;
const SNAPSHOT_RANGE = dataRange(SNAPSHOTS_SHEET_SCHEMA, 1500);

export interface SnapshotRecord {
  snapshotId: string;
  accountId: string;
  date: string;
  balance: number;
  note: string;
}

interface SnapshotsRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseSnapshotRow(row: unknown[], rowIndex: number): SnapshotRecord | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    SNAPSHOT_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [snapshotId, accountId, date, balanceRaw, noteRaw] = normalized.map((value) =>
    value.trim(),
  );

  if (!snapshotId) {
    throw new Error(`Invalid snapshot row at index ${rowIndex}: missing snapshot_id`);
  }

  if (!accountId) {
    throw new Error(`Invalid snapshot row at index ${rowIndex}: missing account_id`);
  }

  if (!date) {
    throw new Error(`Invalid snapshot row at index ${rowIndex}: missing date`);
  }

  const balance = requireNumber(balanceRaw, {
    field: "balance",
    rowIndex,
  });

  return {
    snapshotId,
    accountId,
    date,
    balance,
    note: noteRaw ?? "",
  };
}

export function createSnapshotsRepository({
  sheets,
  spreadsheetId,
}: SnapshotsRepositoryOptions) {
  return {
    async list(): Promise<SnapshotRecord[]> {
      const response = await executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: SNAPSHOT_RANGE,
        }),
      );

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;
      ensureHeaderRow(headerRow, SNAPSHOT_HEADERS, "snapshots");

      const results: SnapshotRecord[] = [];

      for (let index = 0; index < dataRows.length; index += 1) {
        const parsed = parseSnapshotRow(dataRows[index], index + 2);

        if (parsed) {
          results.push(parsed);
        }
      }

      return results;
    },

    async save(records: SnapshotRecord[]) {
      const rows: string[][] = [Array.from(SNAPSHOT_HEADERS) as string[]];

      for (const record of records) {
        rows.push([
          record.snapshotId,
          record.accountId,
          record.date,
          String(record.balance),
          record.note ?? "",
        ]);
      }

      const range = dataRange(
        SNAPSHOTS_SHEET_SCHEMA,
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
