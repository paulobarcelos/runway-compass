// ABOUTME: Bootstraps required sheets and meta rows for Google spreadsheets.
// ABOUTME: Ensures `_meta` sheet tracks schema version and timestamps.
import type { Session } from "next-auth";

import type { sheets_v4 } from "googleapis";

import { getSession } from "../auth/session";
import { createSheetsClient, type GoogleAuthTokens } from "./clients";

const META_SHEET_TITLE = "_meta";
const META_RANGE = `${META_SHEET_TITLE}!A1:B100`;

interface BootstrapSpreadsheetParams {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  schemaVersion?: string;
  now?: () => number;
}

const REQUIRED_KEYS = [
  "selected_spreadsheet_id",
  "schema_version",
  "last_bootstrapped_at",
];

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

  const hasMetaSheet = Boolean(
    metadata.data.sheets?.some((sheet) => sheet.properties?.title === META_SHEET_TITLE),
  );

  if (!hasMetaSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: META_SHEET_TITLE,
                sheetType: "GRID",
                hidden: true,
                gridProperties: {
                  rowCount: 20,
                  columnCount: 2,
                },
              },
            },
          },
        ],
      },
    });
  }

  let existingValues: string[][] = [];

  try {
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: META_RANGE,
    });

    existingValues = existing.data.values ?? [];
  } catch (error) {
    existingValues = [];
  }

  const entries = new Map<string, string>();

  for (const row of existingValues) {
    const [key, value] = row;

    if (typeof key === "string" && key.trim()) {
      entries.set(key, typeof value === "string" ? value : "");
    }
  }

  const selectedSpreadsheetId =
    entries.get("selected_spreadsheet_id") ?? spreadsheetId;

  const isoTimestamp = new Date(now()).toISOString();

  const orderedRows: string[][] = [
    ["key", "value"],
    ["selected_spreadsheet_id", selectedSpreadsheetId],
    ["schema_version", schemaVersion],
    ["last_bootstrapped_at", isoTimestamp],
  ];

  for (const [key, value] of entries) {
    if (REQUIRED_KEYS.includes(key)) {
      continue;
    }

    orderedRows.push([key, value ?? ""]);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${META_SHEET_TITLE}!A1:B${orderedRows.length}`,
    valueInputOption: "RAW",
    resource: {
      values: orderedRows,
    },
  });

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
