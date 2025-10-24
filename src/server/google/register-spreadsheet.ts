// ABOUTME: Registers the spreadsheet selection using authenticated session tokens.
// ABOUTME: Persists manifest metadata to the Sheets `_meta` tab.
import type { Session } from "next-auth";

import { getSession } from "@/server/auth/session";

import type { sheets_v4 } from "googleapis";

import { createSheetsClient, type GoogleAuthTokens } from "./clients";
import { bootstrapSpreadsheet } from "./bootstrap";
import { META_SHEET_TITLE } from "./sheet-schemas";

interface RegisterSpreadsheetOptions {
  spreadsheetId: string;
  getSession?: () => Promise<Session | null>;
  createSheetsClient?: (tokens: GoogleAuthTokens) => sheets_v4.Sheets;
  bootstrapSpreadsheet?: (params: {
    sheets: sheets_v4.Sheets;
    spreadsheetId: string;
    schemaVersion?: string;
    sheetTitles?: readonly string[];
    now?: () => number;
  }) => Promise<{
    selectedSpreadsheetId: string;
    schemaVersion: string;
    bootstrappedAt: string;
    repairedSheets: readonly string[];
  }>;
  schemaVersion?: string;
  bootstrapSheetTitles?: readonly string[];
  now?: () => number;
}

interface RegisterSpreadsheetResult {
  spreadsheetId: string;
  storedAt: number;
}

export async function registerSpreadsheetSelection({
  spreadsheetId,
  getSession: resolveSession = getSession,
  createSheetsClient: resolveSheetsClient = createSheetsClient,
  bootstrapSpreadsheet: bootstrap = bootstrapSpreadsheet,
  schemaVersion = "1.0.0",
  bootstrapSheetTitles = [META_SHEET_TITLE],
  now = Date.now,
}: RegisterSpreadsheetOptions): Promise<RegisterSpreadsheetResult> {
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

  const sheets = resolveSheetsClient(tokens);

  await bootstrap({
    sheets,
    spreadsheetId,
    schemaVersion,
    sheetTitles: bootstrapSheetTitles,
    now,
  });

  return {
    spreadsheetId,
    storedAt: now(),
  };
}
