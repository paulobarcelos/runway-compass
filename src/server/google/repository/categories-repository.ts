// ABOUTME: Loads and persists category records from the `categories` sheet.
// ABOUTME: Validates sheet rows and maps them to typed category structures.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import { CATEGORIES_SHEET_SCHEMA, dataRange } from "@/server/google/sheet-schemas";
import {
  ensureHeaderRow as assertHeaderRow,
  isEmptyRow,
  normalizeRow,
  optionalNumber,
  parseBoolean,
  requireInteger,
} from "./sheet-utils";

const CATEGORY_HEADERS = CATEGORIES_SHEET_SCHEMA.headers;
const CATEGORY_RANGE = dataRange(CATEGORIES_SHEET_SCHEMA, 1000);
const VALID_FLOW_TYPES = new Set(["income", "expense"] as const);

export interface CategoryRecord {
  categoryId: string;
  label: string;
  color: string;
  flowType: "income" | "expense";
  rolloverFlag: boolean;
  sortOrder: number;
  monthlyBudget: number;
  currencyCode: string;
}

interface CategoriesRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function parseCategoryRow(row: unknown[], dataIndex: number): CategoryRecord | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    CATEGORY_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [
    categoryId,
    label,
    color,
    flowTypeRaw,
    rolloverRaw,
    sortOrderRaw,
    monthlyBudgetRaw,
    currencyCodeRaw,
  ] = normalized;

  if (!categoryId.trim()) {
    throw new Error(`Invalid category row at index ${dataIndex}: missing category_id`);
  }

  if (!label.trim()) {
    throw new Error(`Invalid category row at index ${dataIndex}: missing label`);
  }

  if (!color.trim()) {
    throw new Error(`Invalid category row at index ${dataIndex}: missing color`);
  }

  const flowTypeNormalized = String(flowTypeRaw ?? "").trim().toLowerCase();
  const flowType = VALID_FLOW_TYPES.has(flowTypeNormalized as CategoryRecord["flowType"])
    ? (flowTypeNormalized as CategoryRecord["flowType"])
    : "expense";

  const sortOrder = requireInteger(sortOrderRaw, {
    field: "sort_order",
    rowIndex: dataIndex,
  });
  const rolloverFlag = parseBoolean(rolloverRaw);
  const monthlyBudget = optionalNumber(monthlyBudgetRaw ?? "", {
    field: "monthly_budget",
    rowIndex: dataIndex,
  });
  const currencyCode = (currencyCodeRaw ?? "").trim().toUpperCase();

  return {
    categoryId: categoryId.trim(),
    label: label.trim(),
    color: color.trim(),
    flowType,
    rolloverFlag,
    sortOrder,
    monthlyBudget,
    currencyCode,
  };
}

export function createCategoriesRepository({
  sheets,
  spreadsheetId,
}: CategoriesRepositoryOptions) {
  return {
    async list(): Promise<CategoryRecord[]> {
      const response = await executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: CATEGORY_RANGE,
        }),
      );

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;

      assertHeaderRow(headerRow, CATEGORY_HEADERS, "categories");

      const records: CategoryRecord[] = [];

      for (let index = 0; index < dataRows.length; index += 1) {
        const parsed = parseCategoryRow(dataRows[index], index + 2);

        if (parsed) {
          records.push(parsed);
        }
      }

      return records;
    },

    async save(records: CategoryRecord[]) {
      const header = Array.from(CATEGORY_HEADERS);

      const rows: (string | number | boolean)[][] = [header];

      for (const record of records) {
        const currencyCode = (record.currencyCode ?? "").trim().toUpperCase();
        const monthlyBudgetString =
          Number.isFinite(record.monthlyBudget) && record.monthlyBudget !== 0
            ? String(record.monthlyBudget)
            : "";
        const flowType = VALID_FLOW_TYPES.has(record.flowType)
          ? record.flowType
          : "expense";

        rows.push([
          record.categoryId,
          record.label,
          record.color,
          flowType,
          record.rolloverFlag ? "TRUE" : "FALSE",
          String(record.sortOrder),
          monthlyBudgetString,
          currencyCode,
        ]);
      }

      const range = dataRange(CATEGORIES_SHEET_SCHEMA, Math.max(records.length + 1, 1));

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
