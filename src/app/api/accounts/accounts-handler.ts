// ABOUTME: Provides dependency-injected handlers for accounts API routes.
// ABOUTME: Shared between runtime route and tests.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

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

    const payload = await request.json().catch(() => null);
    const accounts = parseAccountsPayload(payload);
    const snapshotPayload = Array.isArray((payload as Record<string, unknown>)?.snapshots)
      ? (payload as Record<string, unknown>).snapshots
      : null;

    if (!accounts) {
      return NextResponse.json({ error: "Missing accounts payload" }, { status: 400 });
    }

    try {
      await saveAccounts({ spreadsheetId, accounts });

      const accountIds = new Set(accounts.map((account) => account.accountId));

      let nextSnapshots: SnapshotRecord[] = [];

      if (Array.isArray(snapshotPayload) && snapshotPayload.length > 0) {
        nextSnapshots = snapshotPayload
          .map((entry) => ({
            snapshotId: String(entry.snapshotId ?? "").trim() || randomUUID(),
            accountId: String(entry.accountId ?? "").trim(),
            date: String(entry.date ?? "").trim(),
            balance:
              typeof entry.balance === "number" && Number.isFinite(entry.balance)
                ? entry.balance
                : 0,
            note: String(entry.note ?? "").trim(),
          }))
          .filter((entry) => entry.accountId && accountIds.has(entry.accountId));
      } else {
        const existingSnapshots = await fetchSnapshots({ spreadsheetId });
        nextSnapshots = existingSnapshots.filter((snapshot) =>
          accountIds.has(snapshot.accountId),
        );
      }

      await saveSnapshots({ spreadsheetId, snapshots: nextSnapshots });

      const { accounts: refreshedAccounts, warnings, errors } = await fetchAccounts({
        spreadsheetId,
      });

      const responsePayload: {
        accounts: typeof refreshedAccounts;
        warnings: typeof warnings;
        errors: typeof errors;
      } = {
        accounts: refreshedAccounts,
        warnings,
        errors,
      };

      return NextResponse.json(responsePayload, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET, POST };
}
