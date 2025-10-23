// ABOUTME: Loads and persists cash flow ledger entries from the sheet.
// ABOUTME: Validates required planning fields and normalizes numeric amounts.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import { CASH_FLOWS_SHEET_SCHEMA, dataRange } from "@/server/google/sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  optionalNumber,
  requireNumber,
} from "./sheet-utils";

const CASH_FLOW_HEADERS = CASH_FLOWS_SHEET_SCHEMA.headers;
const CASH_FLOW_RANGE = dataRange(CASH_FLOWS_SHEET_SCHEMA, 2000);

export interface CashFlowRecord {
  flowId: string;
  type: string;
  categoryId: string;
  plannedDate: string;
  plannedAmount: number;
  actualDate: string;
  actualAmount: number;
  status: string;
  accountId: string;
  note: string;
}

interface CashFlowRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseCashFlowRow(row: unknown[], rowIndex: number): CashFlowRecord | null {
  const normalized = normalizeRow(Array.isArray(row) ? row : [], CASH_FLOW_HEADERS.length);

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
  ] = normalized.map((value) => value.trim());

  if (!flowIdRaw) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing flow_id`);
  }

  if (!typeRaw) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing type`);
  }

  if (!plannedDateRaw) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing planned_date`);
  }

  if (!statusRaw) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing status`);
  }

  const plannedAmount = requireNumber(plannedAmountRaw, {
    field: "planned_amount",
    rowIndex,
  });

  const actualAmount = optionalNumber(
    actualAmountRaw,
    { field: "actual_amount", rowIndex },
    0,
  );

  return {
    flowId: flowIdRaw,
    type: typeRaw,
    categoryId: categoryIdRaw ?? "",
    plannedDate: plannedDateRaw,
    plannedAmount,
    actualDate: actualDateRaw ?? "",
    actualAmount,
    status: statusRaw,
    accountId: accountIdRaw ?? "",
    note: noteRaw ?? "",
  };
}

export function createCashFlowRepository({
  sheets,
  spreadsheetId,
}: CashFlowRepositoryOptions) {
  return {
    async list(): Promise<CashFlowRecord[]> {
      const response = await executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: CASH_FLOW_RANGE,
        }),
      );

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;
      ensureHeaderRow(headerRow, CASH_FLOW_HEADERS, "cash_flows");

      const records: CashFlowRecord[] = [];

      for (let index = 0; index < dataRows.length; index += 1) {
        const parsed = parseCashFlowRow(dataRows[index], index + 2);

        if (parsed) {
          records.push(parsed);
        }
      }

      return records;
    },

    async save(records: CashFlowRecord[]) {
      const rows: string[][] = [Array.from(CASH_FLOW_HEADERS) as string[]];

      for (const record of records) {
        rows.push([
          record.flowId,
          record.type,
          record.categoryId,
          record.plannedDate,
          String(record.plannedAmount),
          record.actualDate,
          String(record.actualAmount ?? 0),
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
