// ABOUTME: Bootstraps required sheets and meta rows for Google spreadsheets.
// ABOUTME: Ensures `_meta` sheet tracks schema version and timestamps.
import type { Session } from "next-auth";

import type { sheets_v4 } from "googleapis";

import { getSession } from "../auth/session";
import { createSheetsClient, type GoogleAuthTokens } from "./clients";
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
  now?: () => number;
}

const META_KEYS = [
  "selected_spreadsheet_id",
  "schema_version",
  "last_bootstrapped_at",
] as const;

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
  now = Date.now,
}: BootstrapSpreadsheetParams) {
  if (!spreadsheetId) {
    throw new Error("Missing spreadsheet identifier");
  }

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });

  const existingTitles = new Set(
    (metadata.data.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title)),
  );

  const missingSchemas = REQUIRED_SHEETS.filter(
    (schema) => !existingTitles.has(schema.title),
  );

  if (missingSchemas.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missingSchemas.map((schema) => ({
          addSheet: {
            properties: sheetPropertiesFor(schema),
          },
        })),
      },
    });
  }

  for (const schema of REQUIRED_SHEETS) {
    if (schema.title === META_SHEET_TITLE) {
      continue;
    }

    let headerRow: string[] | undefined;

    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: headerRange(schema),
      });
      headerRow = (response.data.values?.[0] ?? []) as string[];
    } catch {
      headerRow = undefined;
    }

    if (headersMatch(headerRow, schema.headers)) {
      continue;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: headerRange(schema),
      valueInputOption: "RAW",
      resource: {
        values: [Array.from(schema.headers)],
      },
    });
  }

  const metaRepository = createMetaRepository({ sheets, spreadsheetId });
  const existingMeta = await metaRepository.load();

  const selectedSpreadsheetId =
    existingMeta.get("selected_spreadsheet_id") ?? spreadsheetId;
  const isoTimestamp = new Date(now()).toISOString();

  const orderedMeta = new Map<string, string>();

  orderedMeta.set("selected_spreadsheet_id", selectedSpreadsheetId);
  orderedMeta.set("schema_version", schemaVersion);
  orderedMeta.set("last_bootstrapped_at", isoTimestamp);

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
  };
}

interface BootstrapExistingOptions {
  spreadsheetId: string;
  getSession?: () => Promise<Session | null>;
  createSheetsClient?: (tokens: GoogleAuthTokens) => sheets_v4.Sheets;
  bootstrapSpreadsheet?: typeof bootstrapSpreadsheet;
  schemaVersion?: string;
  now?: () => number;
}

export async function bootstrapExistingSpreadsheet({
  spreadsheetId,
  getSession: resolveSession = getSession,
  createSheetsClient: resolveClient = createSheetsClient,
  bootstrapSpreadsheet: bootstrap = bootstrapSpreadsheet,
  schemaVersion = "1.0.0",
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
    now: () => storedAt,
  });

  return {
    spreadsheetId: result.selectedSpreadsheetId,
    schemaVersion: result.schemaVersion,
    bootstrappedAt: result.bootstrappedAt,
    storedAt,
  };
}
