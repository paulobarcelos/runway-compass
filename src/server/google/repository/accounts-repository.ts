// ABOUTME: Loads and persists account records from the `accounts` sheet.
// ABOUTME: Applies schema validation and boolean/date normalization for rows.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import { ACCOUNTS_SHEET_SCHEMA, dataRange } from "@/server/google/sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  parseBoolean,
} from "./sheet-utils";

const ACCOUNT_HEADERS = ACCOUNTS_SHEET_SCHEMA.headers;
const ACCOUNT_RANGE = dataRange(ACCOUNTS_SHEET_SCHEMA, 1000);
const ACCOUNT_HEADER_EXPECTATION = `accounts sheet headers must match: ${ACCOUNT_HEADERS.join(", ")}`;
const ACCOUNTS_MISSING_SHEET_MESSAGE = 'accounts sheet "accounts" is missing from the spreadsheet';
const ACCOUNTS_RANGE_ERROR_MESSAGE = `accounts sheet range ${ACCOUNT_RANGE} could not be read`;

function extractErrorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const { code, status } = error as { code?: unknown; status?: unknown };

  if (typeof code === "number") {
    return code;
  }

  if (typeof status === "number") {
    return status;
  }

  return null;
}

function extractErrorMessages(error: unknown): string[] {
  const messages: string[] = [];

  if (error instanceof Error && error.message) {
    messages.push(error.message);
  } else if (error && typeof error === "object") {
    const { message } = error as { message?: unknown };

    if (typeof message === "string") {
      messages.push(message);
    }
  }

  if (error && typeof error === "object") {
    const nested = (error as { errors?: Array<{ message?: string }> }).errors;

    if (Array.isArray(nested)) {
      for (const item of nested) {
        if (item && typeof item.message === "string") {
          messages.push(item.message);
        }
      }
    }
  }

  return messages;
}

function parseAccountsSheetError(error: unknown): AccountError | null {
  const code = extractErrorCode(error);
  const normalizedMessages = extractErrorMessages(error).map((message) =>
    message.toLowerCase(),
  );

  if (
    normalizedMessages.some(
      (message) =>
        message.includes("unable to parse range") ||
        message.includes("requested entity was not found") ||
        message.includes("sheet not found") ||
        message.includes("does not exist"),
    )
  ) {
    return {
      code: "missing_sheet",
      message: ACCOUNTS_MISSING_SHEET_MESSAGE,
    };
  }

  if (code === 400 || code === 404) {
    return {
      code: "range_error",
      message: ACCOUNTS_RANGE_ERROR_MESSAGE,
    };
  }

  return null;
}

export interface AccountRecord {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  includeInRunway: boolean;
  sortOrder: number;
  lastSnapshotAt: string | null;
}

export interface AccountWarning {
  rowNumber: number;
  code: "invalid_sort_order";
  message: string;
}

export interface AccountError {
  code: "missing_sheet" | "header_mismatch" | "range_error";
  message: string;
}

export interface AccountsDiagnostics {
  accounts: AccountRecord[];
  warnings: AccountWarning[];
  errors: AccountError[];
}

interface AccountsRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseAccountRow(
  row: unknown[],
  rowIndex: number,
  warnings: AccountWarning[] | null = null,
): AccountRecord | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    ACCOUNT_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [accountId, name, type, currency, includeRaw, sortRaw, lastSnapshot] = normalized.map(
    (value) => value.trim(),
  );

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
  let sortOrder = 0;

  if (sortRaw) {
    const parsedSortOrder = Number.parseInt(sortRaw, 10);

    if (Number.isFinite(parsedSortOrder)) {
      sortOrder = parsedSortOrder;
    } else if (warnings) {
      warnings.push({
        rowNumber: rowIndex,
        code: "invalid_sort_order",
        message: `Sort order value "${sortRaw}" is not a valid integer`,
      });
    }
  }

  const lastSnapshotAt = lastSnapshot ? lastSnapshot : null;

  return {
    accountId,
    name,
    type,
    currency,
    includeInRunway,
    sortOrder,
    lastSnapshotAt,
  };
}

export function createAccountsRepository({
  sheets,
  spreadsheetId,
}: AccountsRepositoryOptions) {
  const loadAccountsWithDiagnostics = async (): Promise<AccountsDiagnostics> => {
    let rows: unknown[][] = [];

    try {
      const response = await executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: ACCOUNT_RANGE,
        }),
      );

      rows = (response.data.values as unknown[][] | undefined) ?? [];
    } catch (error) {
      const structuralError = parseAccountsSheetError(error);

      if (structuralError) {
        return { accounts: [], warnings: [], errors: [structuralError] };
      }

      throw error;
    }

    if (rows.length === 0) {
      return { accounts: [], warnings: [], errors: [] };
    }

    const [headerRow, ...dataRows] = rows;

    try {
      ensureHeaderRow(headerRow, ACCOUNT_HEADERS, "accounts");
    } catch {
      return {
        accounts: [],
        warnings: [],
        errors: [
          {
            code: "header_mismatch",
            message: ACCOUNT_HEADER_EXPECTATION,
          },
        ],
      };
    }

    const warnings: AccountWarning[] = [];
    const records: AccountRecord[] = [];

    for (let index = 0; index < dataRows.length; index += 1) {
      const parsed = parseAccountRow(dataRows[index], index + 2, warnings);

      if (parsed) {
        records.push(parsed);
      }
    }

    return { accounts: records, warnings, errors: [] };
  };

  return {
    async list(): Promise<AccountRecord[]> {
      const result = await loadAccountsWithDiagnostics();

      return result.accounts;
    },

    async listWithDiagnostics(): Promise<AccountsDiagnostics> {
      return loadAccountsWithDiagnostics();
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
          String(record.sortOrder ?? 0),
          record.lastSnapshotAt ?? "",
        ]);
      }

      const range = dataRange(ACCOUNTS_SHEET_SCHEMA, Math.max(records.length + 1, 1));

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
