// ABOUTME: Bootstraps required sheets and meta rows for Google spreadsheets.
// ABOUTME: Ensures `_meta` sheet tracks schema version and timestamps.
import type { Session } from "next-auth";

import type { sheets_v4 } from "googleapis";

import { getSession } from "@/server/auth/session";
import { createSheetsClient, type GoogleAuthTokens } from "./clients";
import { executeWithRetry } from "./retry";
import {
  META_SHEET_TITLE,
  REQUIRED_SHEETS,
  headerRange,
  sheetPropertiesFor,
} from "./sheet-schemas";
import { createMetaRepository } from "./repository/meta-repository";

interface BootstrapSpreadsheetParams {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  schemaVersion?: string;
  sheetTitles?: readonly string[];
  now?: () => number;
}

const META_KEYS = [
  "selected_spreadsheet_id",
  "schema_version",
  "last_bootstrapped_at",
  "budget_horizon_start",
  "budget_horizon_months",
] as const;

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function computeDefaultHorizonStart(nowTimestamp: number) {
  const nowDate = new Date(nowTimestamp);
  const firstOfMonth = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  return formatIsoDate(firstOfMonth);
}

function normalizeBudgetHorizonStart(
  value: string | undefined,
  fallback: string,
) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return fallback;
}

function normalizeBudgetHorizonMonths(
  value: string | undefined,
  fallback: number,
) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 120) {
        return String(parsed);
      }
    }
  }

  return String(fallback);
}

function headersMatch(actual: string[] | undefined, expected: readonly string[]) {
  if (!actual) {
    return false;
  }

  if (actual.length !== expected.length) {
    return false;
  }

  return expected.every((value, index) => actual[index] === value);
}

export async function bootstrapSpreadsheet({
  sheets,
  spreadsheetId,
  schemaVersion = "1.0.0",
  sheetTitles,
  now = Date.now,
}: BootstrapSpreadsheetParams) {
  if (!spreadsheetId) {
    throw new Error("Missing spreadsheet identifier");
  }

  const metadata = await executeWithRetry(() =>
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets(properties(title))",
    }),
  );

  const existingTitles = new Set(
    (metadata.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title)),
  );

  const normalizedTitles = Array.isArray(sheetTitles)
    ? sheetTitles
        .map((title) => (typeof title === "string" ? title.trim() : ""))
        .filter((title) => title.length > 0)
    : null;

  const targetTitleSet =
    normalizedTitles && normalizedTitles.length > 0
      ? new Set(normalizedTitles)
      : new Set(REQUIRED_SHEETS.map((schema) => schema.title));

  targetTitleSet.add(META_SHEET_TITLE);

  const targetSchemas = REQUIRED_SHEETS.filter((schema) =>
    targetTitleSet.has(schema.title),
  );

  if (targetSchemas.length === 0) {
    throw new Error("No matching sheet schemas requested for bootstrap");
  }

  const missingSchemas = targetSchemas.filter(
    (schema) => !existingTitles.has(schema.title),
  );

  if (missingSchemas.length > 0) {
    await executeWithRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: missingSchemas.map((schema) => ({
            addSheet: {
              properties: sheetPropertiesFor(schema),
            },
          })),
        },
      }),
    );
  }

  for (const schema of targetSchemas) {
    if (schema.title === META_SHEET_TITLE) {
      continue;
    }

    let headerRow: string[] | undefined;

    try {
      const response = await executeWithRetry(() =>
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: headerRange(schema),
        }),
      );
      headerRow = (response.data.values?.[0] ?? []) as string[];
    } catch {
      headerRow = undefined;
    }

    if (headersMatch(headerRow, schema.headers)) {
      continue;
    }

    await executeWithRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: headerRange(schema),
        valueInputOption: "RAW",
        requestBody: {
          values: [Array.from(schema.headers)],
        },
      }),
    );
  }

  const metaRepository = createMetaRepository({ sheets, spreadsheetId });
  const existingMeta = await metaRepository.load();

  const selectedSpreadsheetId =
    existingMeta.get("selected_spreadsheet_id") ?? spreadsheetId;
  const currentTimestamp = now();
  const isoTimestamp = new Date(currentTimestamp).toISOString();
  const defaultHorizonStart = computeDefaultHorizonStart(currentTimestamp);
  const normalizedHorizonStart = normalizeBudgetHorizonStart(
    existingMeta.get("budget_horizon_start"),
    defaultHorizonStart,
  );
  const normalizedHorizonMonths = normalizeBudgetHorizonMonths(
    existingMeta.get("budget_horizon_months"),
    12,
  );

  const orderedMeta = new Map<string, string>();

  orderedMeta.set("selected_spreadsheet_id", selectedSpreadsheetId);
  orderedMeta.set("schema_version", schemaVersion);
  orderedMeta.set("last_bootstrapped_at", isoTimestamp);
  orderedMeta.set("budget_horizon_start", normalizedHorizonStart);
  orderedMeta.set("budget_horizon_months", normalizedHorizonMonths);

  for (const [key, value] of existingMeta) {
    if (META_KEYS.includes(key as (typeof META_KEYS)[number])) {
      continue;
    }

    orderedMeta.set(key, value ?? "");
  }

  await metaRepository.save(orderedMeta);

  return {
    selectedSpreadsheetId,
    schemaVersion,
    bootstrappedAt: isoTimestamp,
    repairedSheets: targetSchemas.map((schema) => schema.title),
  };
}

interface BootstrapExistingOptions {
  spreadsheetId: string;
  getSession?: () => Promise<Session | null>;
  createSheetsClient?: (tokens: GoogleAuthTokens) => sheets_v4.Sheets;
  bootstrapSpreadsheet?: typeof bootstrapSpreadsheet;
  schemaVersion?: string;
  sheetTitles?: readonly string[];
  now?: () => number;
}

export async function bootstrapExistingSpreadsheet({
  spreadsheetId,
  getSession: resolveSession = getSession,
  createSheetsClient: resolveClient = createSheetsClient,
  bootstrapSpreadsheet: bootstrap = bootstrapSpreadsheet,
  schemaVersion = "1.0.0",
  sheetTitles,
  now = Date.now,
}: BootstrapExistingOptions) {
  if (!spreadsheetId) {
    throw new Error("Missing spreadsheet identifier");
  }

  const session = await resolveSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = resolveClient(tokens);
  const storedAt = now();

  const result = await bootstrap({
    sheets,
    spreadsheetId,
    schemaVersion,
    sheetTitles,
    now: () => storedAt,
  });

  return {
    spreadsheetId: result.selectedSpreadsheetId,
    schemaVersion: result.schemaVersion,
    bootstrappedAt: result.bootstrappedAt,
    repairedSheets: result.repairedSheets,
    storedAt,
  };
}
