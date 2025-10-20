// ABOUTME: Loads derived runway projection rows from the sheet.
// ABOUTME: Validates numeric balances and ensures stoplight status is present.
import type { sheets_v4 } from "googleapis";

import { RUNWAY_PROJECTION_SHEET_SCHEMA, dataRange } from "../sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  requireInteger,
  requireNumber,
} from "./sheet-utils";

const PROJECTION_HEADERS = RUNWAY_PROJECTION_SHEET_SCHEMA.headers;
const PROJECTION_RANGE = dataRange(RUNWAY_PROJECTION_SHEET_SCHEMA, 1500);

export interface RunwayProjectionRecord {
  month: number;
  year: number;
  startingBalance: number;
  incomeTotal: number;
  expenseTotal: number;
  endingBalance: number;
  stoplightStatus: string;
  notes: string;
}

interface RunwayProjectionRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseProjectionRow(row: unknown[], rowIndex: number): RunwayProjectionRecord | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    PROJECTION_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [
    monthRaw,
    yearRaw,
    startingBalanceRaw,
    incomeTotalRaw,
    expenseTotalRaw,
    endingBalanceRaw,
    status,
    note,
  ] = normalized.map((value) => value.trim());

  if (!monthRaw) {
    throw new Error(`Invalid runway projection row at index ${rowIndex}: missing month`);
  }

  if (!yearRaw) {
    throw new Error(`Invalid runway projection row at index ${rowIndex}: missing year`);
  }

  if (!startingBalanceRaw) {
    throw new Error(
      `Invalid runway projection row at index ${rowIndex}: missing starting_balance`,
    );
  }

  if (!incomeTotalRaw) {
    throw new Error(
      `Invalid runway projection row at index ${rowIndex}: missing income_total`,
    );
  }

  if (!expenseTotalRaw) {
    throw new Error(
      `Invalid runway projection row at index ${rowIndex}: missing expense_total`,
    );
  }

  if (!endingBalanceRaw) {
    throw new Error(
      `Invalid runway projection row at index ${rowIndex}: missing ending_balance`,
    );
  }

  if (!status) {
    throw new Error(`Invalid runway projection row at index ${rowIndex}: missing stoplight_status`);
  }

  const month = requireInteger(monthRaw, { field: "month", rowIndex });
  const year = requireInteger(yearRaw, { field: "year", rowIndex });
  const startingBalance = requireNumber(startingBalanceRaw, {
    field: "starting_balance",
    rowIndex,
  });
  const incomeTotal = requireNumber(incomeTotalRaw, {
    field: "income_total",
    rowIndex,
  });
  const expenseTotal = requireNumber(expenseTotalRaw, {
    field: "expense_total",
    rowIndex,
  });
  const endingBalance = requireNumber(endingBalanceRaw, {
    field: "ending_balance",
    rowIndex,
  });

  return {
    month,
    year,
    startingBalance,
    incomeTotal,
    expenseTotal,
    endingBalance,
    stoplightStatus: status,
    notes: note ?? "",
  };
}

export function createRunwayProjectionRepository({
  sheets,
  spreadsheetId,
}: RunwayProjectionRepositoryOptions) {
  return {
    async list(): Promise<RunwayProjectionRecord[]> {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: PROJECTION_RANGE,
      });

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;
      ensureHeaderRow(headerRow, PROJECTION_HEADERS, "runway_projection");

      const projections: RunwayProjectionRecord[] = [];

      for (let index = 0; index < dataRows.length; index += 1) {
        const parsed = parseProjectionRow(dataRows[index], index + 2);

        if (parsed) {
          projections.push(parsed);
        }
      }

      return projections;
    },

    async save(records: RunwayProjectionRecord[]) {
      const rows: string[][] = [Array.from(PROJECTION_HEADERS) as string[]];

      for (const record of records) {
        rows.push([
          String(record.month),
          String(record.year),
          String(record.startingBalance),
          String(record.incomeTotal),
          String(record.expenseTotal),
          String(record.endingBalance),
          record.stoplightStatus,
          record.notes ?? "",
        ]);
      }

      const range = dataRange(
        RUNWAY_PROJECTION_SHEET_SCHEMA,
        Math.max(records.length + 1, 1),
      );

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
