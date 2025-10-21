// ABOUTME: Exposes authenticated API endpoint for reading account records.
// ABOUTME: Validates spreadsheet identifier and maps repository results to JSON.
import { NextResponse } from "next/server";

import { getSession } from "../../../server/auth/session";
import { createSheetsClient } from "../../../server/google/clients";
import { createAccountsRepository } from "../../../server/google/repository/accounts-repository";

interface FetchAccountsOptions {
  spreadsheetId: string;
}

type FetchAccounts = (options: FetchAccountsOptions) => Promise<
  Array<{
    accountId: string;
    name: string;
    type: string;
    currency: string;
    includeInRunway: boolean;
    snapshotFrequency: string;
    lastSnapshotAt: string | null;
  }>
>;

async function fetchAccountsFromSheets({ spreadsheetId }: FetchAccountsOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const repository = createAccountsRepository({ sheets, spreadsheetId });

  return repository.list();
}

export function createAccountsHandler({
  fetchAccounts = fetchAccountsFromSheets,
}: {
  fetchAccounts?: FetchAccounts;
} = {}) {
  return async function GET(request: Request) {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const accounts = await fetchAccounts({ spreadsheetId });

      return NextResponse.json({ accounts }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };
}

export const GET = createAccountsHandler();

export type { FetchAccountsOptions };
