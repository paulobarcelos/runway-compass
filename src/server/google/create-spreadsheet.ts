// ABOUTME: Creates a Google Sheet then registers it in the app manifest.
// ABOUTME: Reuses session tokens to persist manifest metadata.
import type { Session } from "next-auth";

import { getSession } from "@/server/auth/session";

import type { GoogleAuthTokens } from "./clients";
import { createSpreadsheet as createDriveSpreadsheet } from "./drive";
import { registerSpreadsheetSelection } from "./register-spreadsheet";

interface CreateAndRegisterOptions {
  getSession?: () => Promise<Session | null>;
  createSpreadsheet?: (params: {
    tokens: GoogleAuthTokens;
    title?: string;
  }) => Promise<{ spreadsheetId: string }>;
  registerSpreadsheetSelection?: (params: {
    spreadsheetId: string;
    getSession?: () => Promise<Session | null>;
    now?: () => number;
  }) => Promise<{ spreadsheetId: string; storedAt: number }>;
  now?: () => number;
  defaultTitle?: string;
}

export async function createAndRegisterSpreadsheet({
  getSession: resolveSession = getSession,
  createSpreadsheet = createDriveSpreadsheet,
  registerSpreadsheetSelection: registerSelection = registerSpreadsheetSelection,
  now = Date.now,
  defaultTitle = "Runway Compass",
}: CreateAndRegisterOptions = {}) {
  const session = await resolveSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const { spreadsheetId } = await createSpreadsheet({
    tokens,
    title: defaultTitle,
  });

  const manifest = await registerSelection({
    spreadsheetId,
    getSession: async () => session,
    bootstrapSheetTitles: [],
    now,
  });

  return manifest;
}
