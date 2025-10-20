// ABOUTME: Loads and persists account records from the `accounts` sheet.
// ABOUTME: Applies schema validation and boolean/date normalization for rows.
import type { sheets_v4 } from "googleapis";

import { ACCOUNTS_SHEET_SCHEMA, dataRange } from "../sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  parseBoolean,
} from "./sheet-utils";

const ACCOUNT_HEADERS = ACCOUNTS_SHEET_SCHEMA.headers;
const ACCOUNT_RANGE = dataRange(ACCOUNTS_SHEET_SCHEMA, 1000);

export interface AccountRecord {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  includeInRunway: boolean;
  snapshotFrequency: string;
  lastSnapshotAt: string | null;
}

interface AccountsRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseAccountRow(row: unknown[], rowIndex: number): AccountRecord | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    ACCOUNT_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [
    accountId,
    name,
    type,
    currency,
    includeRaw,
    frequency,
    lastSnapshot,
  ] = normalized.map((value) => value.trim());

  if (!accountId) {
    throw new Error(`Invalid account row at index ${rowIndex}: missing account_id`);
  }

  if (!name) {
    throw new Error(`Invalid account row at index ${rowIndex}: missing name`);
  }

  if (!type) {
    throw new Error(`Invalid account row at index ${rowIndex}: missing type`);
  }

  if (!currency) {
    throw new Error(`Invalid account row at index ${rowIndex}: missing currency`);
  }

  const includeInRunway = parseBoolean(includeRaw);
  const snapshotFrequency = frequency;
  const lastSnapshotAt = lastSnapshot ? lastSnapshot : null;

  return {
    accountId,
    name,
    type,
    currency,
    includeInRunway,
    snapshotFrequency,
    lastSnapshotAt,
  };
}

export function createAccountsRepository({
  sheets,
  spreadsheetId,
}: AccountsRepositoryOptions) {
  return {
    async list(): Promise<AccountRecord[]> {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: ACCOUNT_RANGE,
      });

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;

      ensureHeaderRow(headerRow, ACCOUNT_HEADERS, "accounts");

      const records: AccountRecord[] = [];

      for (let index = 0; index < dataRows.length; index += 1) {
        const parsed = parseAccountRow(dataRows[index], index + 2);

        if (parsed) {
          records.push(parsed);
        }
      }

      return records;
    },

    async save(records: AccountRecord[]) {
      const rows: string[][] = [Array.from(ACCOUNT_HEADERS) as string[]];

      for (const record of records) {
        rows.push([
          record.accountId,
          record.name,
          record.type,
          record.currency,
          record.includeInRunway ? "TRUE" : "FALSE",
          record.snapshotFrequency,
          record.lastSnapshotAt ?? "",
        ]);
      }

      const range = dataRange(ACCOUNTS_SHEET_SCHEMA, Math.max(records.length + 1, 1));

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        resource: {
          values: rows,
        },
      });
    },
  };
}
