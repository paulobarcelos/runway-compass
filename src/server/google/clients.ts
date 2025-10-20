// ABOUTME: Creates authenticated Google API clients for the server runtime.
// ABOUTME: Configures Sheets client using OAuth2 credentials from the session.
import { google, type sheets_v4 } from "googleapis";

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

type GoogleModule = typeof google;

export function createSheetsClient(
  tokens: GoogleAuthTokens,
  googleModule: GoogleModule = google,
): sheets_v4.Sheets {
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

  return googleModule.sheets({ version: "v4", auth: oauthClient });
}
