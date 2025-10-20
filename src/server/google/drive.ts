// ABOUTME: Creates Google Drive spreadsheets using OAuth credentials.
// ABOUTME: Returns spreadsheet identifiers for downstream registration.
import { google } from "googleapis";

import type { GoogleAuthTokens } from "./clients";

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

interface CreateSpreadsheetParams {
  tokens: GoogleAuthTokens;
  title?: string;
  googleModule?: typeof google;
}

export async function createSpreadsheet({
  tokens,
  title = "Runway Compass",
  googleModule = google,
}: CreateSpreadsheetParams) {
  if (!tokens.accessToken || !tokens.refreshToken) {
    throw new Error("Missing Google OAuth tokens");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth client credentials");
  }

  const oauthClient = new googleModule.auth.OAuth2(clientId, clientSecret);

  oauthClient.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt,
  });

  const drive = googleModule.drive({ version: "v3", auth: oauthClient });

  const response = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: SPREADSHEET_MIME,
    },
    fields: "id",
  });

  const spreadsheetId = response.data.id;

  if (!spreadsheetId) {
    throw new Error("Failed to create spreadsheet");
  }

  return { spreadsheetId };
}
