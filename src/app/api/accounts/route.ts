// ABOUTME: Exposes authenticated API endpoint for reading account records.
// ABOUTME: Validates spreadsheet identifier and maps repository results to JSON.
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import {
  createAccountsRepository,
  type AccountRecord,
  type AccountsDiagnostics,
} from "@/server/google/repository/accounts-repository";
import {
  createSnapshotsRepository,
  type SnapshotRecord,
} from "@/server/google/repository/snapshots-repository";

interface FetchAccountsOptions {
  spreadsheetId: string;
}

type FetchAccounts = (options: FetchAccountsOptions) => Promise<AccountsDiagnostics>;

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

  return repository.listWithDiagnostics();
}

interface SaveAccountsOptions extends FetchAccountsOptions {
  accounts: AccountRecord[];
}

type SaveAccounts = (options: SaveAccountsOptions) => Promise<void>;

async function saveAccountsToSheets({
  spreadsheetId,
  accounts,
}: SaveAccountsOptions) {
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

  await repository.save(accounts);
}

type FetchSnapshotsOptions = FetchAccountsOptions;

type FetchSnapshots = (options: FetchSnapshotsOptions) => Promise<SnapshotRecord[]>;

async function fetchSnapshotsFromSheets({ spreadsheetId }: FetchSnapshotsOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const repository = createSnapshotsRepository({ sheets, spreadsheetId });

  return repository.list();
}

interface SaveSnapshotsOptions extends FetchAccountsOptions {
  snapshots: SnapshotRecord[];
}

type SaveSnapshots = (options: SaveSnapshotsOptions) => Promise<void>;

async function saveSnapshotsToSheets({ spreadsheetId, snapshots }: SaveSnapshotsOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const repository = createSnapshotsRepository({ sheets, spreadsheetId });

  await repository.save(snapshots);
}

function parseAccountsPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const rawAccounts = payload.accounts;

  if (!Array.isArray(rawAccounts)) {
    return null;
  }

  const accounts: AccountRecord[] = [];

  for (let index = 0; index < rawAccounts.length; index += 1) {
    const item = rawAccounts[index];

    if (!item || typeof item !== "object") {
      return null;
    }

    const {
      accountId,
      name,
      type,
      currency,
      includeInRunway,
      sortOrder,
      lastSnapshotAt,
    } = item as Record<string, unknown>;

    if (typeof accountId !== "string" || !accountId.trim()) {
      return null;
    }

    if (typeof name !== "string" || !name.trim()) {
      return null;
    }

    if (typeof type !== "string" || !type.trim()) {
      return null;
    }

    if (typeof currency !== "string" || !currency.trim()) {
      return null;
    }

    const parsedSortOrder =
      typeof sortOrder === "number" && Number.isFinite(sortOrder)
        ? Math.trunc(sortOrder)
        : typeof sortOrder === "string" && sortOrder.trim()
          ? Number.parseInt(sortOrder.trim(), 10)
          : 0;

    if (!Number.isFinite(parsedSortOrder)) {
      return null;
    }

    accounts.push({
      accountId: accountId.trim(),
      name: name.trim(),
      type: type.trim(),
      currency: currency.trim().toUpperCase(),
      includeInRunway: Boolean(includeInRunway),
      sortOrder: parsedSortOrder,
      lastSnapshotAt:
        typeof lastSnapshotAt === "string" && lastSnapshotAt.trim() ? lastSnapshotAt.trim() : null,
    });
  }

  return accounts;
}

export function createAccountsHandler({
  fetchAccounts = fetchAccountsFromSheets,
  saveAccounts = saveAccountsToSheets,
  fetchSnapshots = fetchSnapshotsFromSheets,
  saveSnapshots = saveSnapshotsToSheets,
}: {
  fetchAccounts?: FetchAccounts;
  saveAccounts?: SaveAccounts;
  fetchSnapshots?: FetchSnapshots;
  saveSnapshots?: SaveSnapshots;
} = {}) {
  const GET = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const { accounts, warnings, errors } = await fetchAccounts({ spreadsheetId });

      return NextResponse.json({ accounts, warnings, errors }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  const POST = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    let accounts: AccountRecord[] | null = null;

    try {
      const payload = await request.json();
      accounts = parseAccountsPayload(payload);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!accounts) {
      return NextResponse.json({ error: "Missing accounts payload" }, { status: 400 });
    }

    try {
      await saveAccounts({ spreadsheetId, accounts });
      const activeAccountIds = new Set(accounts.map((account) => account.accountId));
      const existingSnapshots = await fetchSnapshots({ spreadsheetId });
      const filteredSnapshots = existingSnapshots.filter((snapshot) =>
        activeAccountIds.has(snapshot.accountId),
      );

      if (filteredSnapshots.length !== existingSnapshots.length) {
        await saveSnapshots({ spreadsheetId, snapshots: filteredSnapshots });
      }

      const diagnostics = await fetchAccounts({ spreadsheetId });

      return NextResponse.json(
        {
          accounts: diagnostics.accounts,
          warnings: diagnostics.warnings,
          errors: diagnostics.errors,
        },
        { status: 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const responseStatus =
        message === "Missing authenticated session" || message === "Missing Google tokens"
          ? 401
          : 500;

      return NextResponse.json({ error: message }, { status: responseStatus });
    }
  };

  return { GET, POST };
}

const handlers = createAccountsHandler();

export const GET = handlers.GET;
export const POST = handlers.POST;

export type { FetchAccountsOptions };
