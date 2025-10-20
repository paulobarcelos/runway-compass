// ABOUTME: Registers the spreadsheet selection using authenticated session tokens.
// ABOUTME: Persists manifest metadata to the Sheets `_meta` tab.
import type { Session } from "next-auth";

import { getSession } from "../auth/session";

import type { sheets_v4 } from "googleapis";

import { createSheetsClient, type GoogleAuthTokens } from "./clients";
import { storeSelectedSpreadsheetMeta } from "./meta";

interface RegisterSpreadsheetOptions {
  spreadsheetId: string;
  getSession?: () => Promise<Session | null>;
  createSheetsClient?: (tokens: GoogleAuthTokens) => sheets_v4.Sheets;
  storeSelectedSpreadsheetMeta?: (params: {
    sheets: sheets_v4.Sheets;
    spreadsheetId: string;
  }) => Promise<void>;
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
  storeSelectedSpreadsheetMeta: persistMeta = storeSelectedSpreadsheetMeta,
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

  await persistMeta({
    sheets,
    spreadsheetId,
  });

  return {
    spreadsheetId,
    storedAt: now(),
  };
}
