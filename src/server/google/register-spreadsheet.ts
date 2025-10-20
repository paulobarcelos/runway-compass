// ABOUTME: Registers the spreadsheet selection using authenticated session tokens.
// ABOUTME: Persists manifest metadata to the Sheets `_meta` tab.
import type { Session } from "next-auth";

import { getSession } from "../auth/session";

import type { sheets_v4 } from "googleapis";

import { createSheetsClient, type GoogleAuthTokens } from "./clients";
import { bootstrapSpreadsheet } from "./bootstrap";

interface RegisterSpreadsheetOptions {
  spreadsheetId: string;
  getSession?: () => Promise<Session | null>;
  createSheetsClient?: (tokens: GoogleAuthTokens) => sheets_v4.Sheets;
  bootstrapSpreadsheet?: (params: {
    sheets: sheets_v4.Sheets;
    spreadsheetId: string;
    schemaVersion?: string;
    now?: () => number;
  }) => Promise<{
    selectedSpreadsheetId: string;
    schemaVersion: string;
    bootstrappedAt: string;
  }>;
  schemaVersion?: string;
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
    now,
  });

  return {
    spreadsheetId,
    storedAt: now(),
  };
}
