// ABOUTME: Loads and persists category records from the `categories` sheet.
// ABOUTME: Validates sheet rows and maps them to typed category structures.
import type { sheets_v4 } from "googleapis";

import { CATEGORIES_SHEET_SCHEMA, dataRange } from "../sheet-schemas";

const CATEGORY_HEADERS = CATEGORIES_SHEET_SCHEMA.headers;
const CATEGORY_RANGE = dataRange(CATEGORIES_SHEET_SCHEMA, 1000);

export interface CategoryRecord {
  categoryId: string;
  label: string;
  color: string;
  rolloverFlag: boolean;
  sortOrder: number;
}

interface CategoriesRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function normalizeRowLength(row: unknown[]): string[] {
  const result: string[] = [];

  for (let index = 0; index < CATEGORY_HEADERS.length; index += 1) {
    const value = row[index];
    result.push(typeof value === "string" ? value : value == null ? "" : String(value));
  }

  return result;
}

function isEmptyRow(row: string[]) {
  return row.every((cell) => !cell || !cell.trim());
}

function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function parseSortOrder(value: string, rowIndex: number) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Invalid category row at index ${rowIndex}: missing sort order`);
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid category row at index ${rowIndex}: sort order must be a number`);
  }

  return parsed;
}

function parseCategoryRow(row: unknown[], dataIndex: number): CategoryRecord | null {
  const normalized = normalizeRowLength(Array.isArray(row) ? row : []);

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [categoryId, label, color, rolloverRaw, sortOrderRaw] = normalized;

  if (!categoryId.trim()) {
    throw new Error(`Invalid category row at index ${dataIndex}: missing category_id`);
  }

  if (!label.trim()) {
    throw new Error(`Invalid category row at index ${dataIndex}: missing label`);
  }

  if (!color.trim()) {
    throw new Error(`Invalid category row at index ${dataIndex}: missing color`);
  }

  const sortOrder = parseSortOrder(sortOrderRaw, dataIndex);
  const rolloverFlag = parseBoolean(rolloverRaw);

  return {
    categoryId: categoryId.trim(),
    label: label.trim(),
    color: color.trim(),
    rolloverFlag,
    sortOrder,
  };
}

function ensureHeaderRow(row: unknown[]) {
  const normalized = normalizeRowLength(Array.isArray(row) ? row : []);

  const matches = CATEGORY_HEADERS.every(
    (header, index) => normalized[index] === header,
  );

  if (!matches) {
    throw new Error("Categories sheet header does not match expected schema");
  }
}

export function createCategoriesRepository({
  sheets,
  spreadsheetId,
}: CategoriesRepositoryOptions) {
  return {
    async list(): Promise<CategoryRecord[]> {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: CATEGORY_RANGE,
      });

      const rows = (response.data.values as unknown[][] | undefined) ?? [];

      if (rows.length === 0) {
        return [];
      }

      const [headerRow, ...dataRows] = rows;

      ensureHeaderRow(headerRow);

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
        rows.push([
          record.categoryId,
          record.label,
          record.color,
          record.rolloverFlag ? "TRUE" : "FALSE",
          String(record.sortOrder),
        ]);
      }

      const range = dataRange(CATEGORIES_SHEET_SCHEMA, Math.max(records.length + 1, 1));

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
