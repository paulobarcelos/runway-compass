// ABOUTME: Loads and persists key-value entries in the `_meta` sheet.
// ABOUTME: Normalizes meta rows for spreadsheet bootstrap workflows.
import type { sheets_v4 } from "googleapis";

import {
  META_HEADERS,
  META_SHEET_SCHEMA,
  META_SHEET_TITLE,
  dataRange,
} from "../sheet-schemas";

const META_VALUES_RANGE = `${META_SHEET_TITLE}!A1:B100`;

interface MetaRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function isMissingSheetError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes(META_SHEET_TITLE) ||
    error.message.includes("Unable to parse range")
  );
}

function parseMetaRows(rows: string[][] = []) {
  const entries = new Map<string, string>();

  for (const [index, row] of rows.entries()) {
    if (!Array.isArray(row)) {
      continue;
    }

    const [key, value] = row;

    if (index === 0 && key === META_HEADERS[0]) {
      continue;
    }

    if (typeof key !== "string" || !key.trim()) {
      continue;
    }

    entries.set(key, typeof value === "string" ? value : "");
  }

  return entries;
}

function toMetaRows(entries: Map<string, string>) {
  const rows: string[][] = [Array.from(META_HEADERS)];

  for (const [key, value] of entries) {
    rows.push([key, value ?? ""]);
  }

  return rows;
}

export function createMetaRepository({
  sheets,
  spreadsheetId,
}: MetaRepositoryOptions) {
  return {
    async load(): Promise<Map<string, string>> {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: META_VALUES_RANGE,
        });

        return parseMetaRows(response.data.values as string[][]);
      } catch (error) {
        if (isMissingSheetError(error)) {
          return new Map();
        }

        throw error;
      }
    },

    async save(entries: Map<string, string>) {
      const rows = toMetaRows(entries);
      const range = dataRange(META_SHEET_SCHEMA, rows.length);

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
