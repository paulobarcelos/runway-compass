// ABOUTME: Shared handler factory for snapshot API routes with DI-friendly deps.
// ABOUTME: Handles listing and capturing account snapshots in Sheets.
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import {
  createSnapshotsRepository,
  type SnapshotRecord,
} from "@/server/google/repository/snapshots-repository";
import {
  createAccountsRepository,
  type AccountRecord,
} from "@/server/google/repository/accounts-repository";

interface FetchSnapshotsOptions {
  spreadsheetId: string;
}

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

interface AppendSnapshotOptions {
  spreadsheetId: string;
  snapshot: SnapshotRecord;
}

type AppendSnapshot = (options: AppendSnapshotOptions) => Promise<SnapshotRecord>;

async function appendSnapshotToSheets({
  spreadsheetId,
  snapshot,
}: AppendSnapshotOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const snapshotsRepository = createSnapshotsRepository({ sheets, spreadsheetId });
  const accountsRepository = createAccountsRepository({ sheets, spreadsheetId });

  const existing = await snapshotsRepository.list();
  const nextSnapshots = [...existing, snapshot];

  await snapshotsRepository.save(nextSnapshots);

  const accounts = await accountsRepository.list();
  const updatedAccounts: AccountRecord[] = accounts.map((account) =>
    account.accountId === snapshot.accountId
      ? { ...account, lastSnapshotAt: snapshot.date }
      : account,
  );

  await accountsRepository.save(updatedAccounts);

  return snapshot;
}

function parseSnapshotPayload(value: unknown): SnapshotRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;

  const accountId = typeof payload.accountId === "string" ? payload.accountId.trim() : "";
  const date = typeof payload.date === "string" ? payload.date.trim() : "";
  const balanceRaw = payload.balance;
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (!accountId) {
    return null;
  }

  if (!date) {
    return null;
  }

  const balance = Number(balanceRaw);

  if (!Number.isFinite(balance)) {
    return null;
  }

  return {
    snapshotId: randomUUID(),
    accountId,
    date,
    balance,
    note,
  };
}

export function createSnapshotsHandler({
  fetchSnapshots = fetchSnapshotsFromSheets,
  appendSnapshot = appendSnapshotToSheets,
}: {
  fetchSnapshots?: FetchSnapshots;
  appendSnapshot?: AppendSnapshot;
} = {}) {
  const GET = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const snapshots = await fetchSnapshots({ spreadsheetId });
      return NextResponse.json({ snapshots }, { status: 200 });
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

    let snapshot: SnapshotRecord | null = null;

    try {
      const payload = await request.json();
      snapshot = parseSnapshotPayload(payload?.snapshot);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!snapshot) {
      return NextResponse.json({ error: "Missing snapshot payload" }, { status: 400 });
    }

    try {
      const stored = await appendSnapshot({ spreadsheetId, snapshot });
      return NextResponse.json({ snapshot: stored }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET, POST };
}
