// ABOUTME: Provides testable handlers for the cash flows API endpoints.
// ABOUTME: Validates payloads and bridges HTTP to the Sheets repository.
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import {
  createCashFlowRepository,
  type CashFlowDraft,
  type CashFlowEntry,
  type CashFlowStatus,
} from "@/server/google/repository/cash-flow-repository";

interface FetchCashFlowsOptions {
  spreadsheetId: string;
}

type FetchCashFlows = (options: FetchCashFlowsOptions) => Promise<CashFlowEntry[]>;

async function fetchCashFlowsFromSheets({ spreadsheetId }: FetchCashFlowsOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const repository = createCashFlowRepository({ sheets, spreadsheetId });

  return repository.list();
}

interface CreateCashFlowOptions extends FetchCashFlowsOptions {
  draft: CashFlowDraft;
}

type CreateCashFlow = (options: CreateCashFlowOptions) => Promise<CashFlowEntry>;

interface UpdateCashFlowOptions extends FetchCashFlowsOptions {
  flowId: string;
  updates: Partial<CashFlowEntry>;
}

type UpdateCashFlow = (options: UpdateCashFlowOptions) => Promise<CashFlowEntry | null>;

interface RemoveCashFlowOptions extends FetchCashFlowsOptions {
  flowId: string;
}

type RemoveCashFlow = (options: RemoveCashFlowOptions) => Promise<void>;

const ALLOWED_STATUSES: ReadonlySet<CashFlowStatus> = new Set(["planned", "posted"]);

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseFlowDraft(value: unknown): CashFlowDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;

  const date = sanitizeString(payload.date);
  const status = sanitizeString(payload.status).toLowerCase();
  const accountId = sanitizeString(payload.accountId);
  const categoryId = sanitizeString(payload.categoryId);
  const note = sanitizeString(payload.note);
  const amountRaw = payload.amount;
  const flowId = sanitizeString(payload.flowId);

  if (!date || !status || !accountId || !categoryId) {
    return null;
  }

  const statusNormalized = status as CashFlowStatus;

  if (!ALLOWED_STATUSES.has(statusNormalized)) {
    return null;
  }

  if (typeof amountRaw !== "number" || !Number.isFinite(amountRaw)) {
    return null;
  }

  return {
    flowId: flowId || undefined,
    date,
    amount: amountRaw,
    status: statusNormalized,
    categoryId,
    accountId,
    note,
  };
}

function parseFlowUpdates(value: unknown): Partial<CashFlowEntry> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const updates: Partial<CashFlowEntry> = {};

  if ("status" in payload) {
    const status = sanitizeString(payload.status);
    if (!ALLOWED_STATUSES.has(status.toLowerCase() as CashFlowStatus)) {
      return null;
    }

    updates.status = status.toLowerCase() as CashFlowStatus;
  }

  if ("date" in payload) {
    const date = sanitizeString(payload.date);
    if (!date) {
      return null;
    }

    updates.date = date;
  }

  if ("amount" in payload) {
    const amount = payload.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      return null;
    }

    updates.amount = amount;
  }

  if ("accountId" in payload) {
    const accountId = sanitizeString(payload.accountId);
    if (!accountId) {
      return null;
    }

    updates.accountId = accountId;
  }

  if ("categoryId" in payload) {
    const categoryId = sanitizeString(payload.categoryId);
    if (!categoryId) {
      return null;
    }

    updates.categoryId = categoryId;
  }

  if ("note" in payload) {
    updates.note = sanitizeString(payload.note);
  }

  const keys = Object.keys(updates);

  if (keys.length === 0) {
    return null;
  }

  return updates;
}

export function createCashFlowsHandler({
  fetchCashFlows = fetchCashFlowsFromSheets,
  createCashFlow = async ({ spreadsheetId, draft }: CreateCashFlowOptions) => {
    const session = await getSession();

    if (!session) {
      throw new Error("Missing authenticated session");
    }

    const tokens = session.googleTokens;

    if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
      throw new Error("Missing Google tokens");
    }

    const sheets = createSheetsClient(tokens);
    const repository = createCashFlowRepository({ sheets, spreadsheetId });
    return repository.create(draft);
  },
  updateCashFlow = async ({ spreadsheetId, flowId, updates }: UpdateCashFlowOptions) => {
    const session = await getSession();

    if (!session) {
      throw new Error("Missing authenticated session");
    }

    const tokens = session.googleTokens;

    if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
      throw new Error("Missing Google tokens");
    }

    const sheets = createSheetsClient(tokens);
    const repository = createCashFlowRepository({ sheets, spreadsheetId });
    return repository.update(flowId, updates);
  },
  removeCashFlow = async ({ spreadsheetId, flowId }: RemoveCashFlowOptions) => {
    const session = await getSession();

    if (!session) {
      throw new Error("Missing authenticated session");
    }

    const tokens = session.googleTokens;

    if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
      throw new Error("Missing Google tokens");
    }

    const sheets = createSheetsClient(tokens);
    const repository = createCashFlowRepository({ sheets, spreadsheetId });
    await repository.remove(flowId);
  },
}: {
  fetchCashFlows?: FetchCashFlows;
  createCashFlow?: CreateCashFlow;
  updateCashFlow?: UpdateCashFlow;
  removeCashFlow?: RemoveCashFlow;
} = {}) {
  const GET = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const flows = await fetchCashFlows({ spreadsheetId });

      return NextResponse.json({ flows }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens"
          ? 401
          : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  const POST = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    let draft: CashFlowDraft | null = null;

    try {
      const payload = await request.json();
      draft = parseFlowDraft(payload?.flow);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!draft) {
      return NextResponse.json({ error: "Missing flow payload" }, { status: 400 });
    }

    try {
      const created = await createCashFlow({ spreadsheetId, draft });
      return NextResponse.json({ flow: created }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens"
          ? 401
          : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  const PATCH = async (request: Request, context: { params: { flowId: string } }) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();
    const flowId = context.params?.flowId?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    if (!flowId) {
      return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
    }

    let updates: Partial<CashFlowEntry> | null = null;

    try {
      const payload = await request.json();
      updates = parseFlowUpdates(payload?.updates);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!updates) {
      return NextResponse.json({ error: "Missing updates payload" }, { status: 400 });
    }

    try {
      const updated = await updateCashFlow({ spreadsheetId, flowId, updates });

      if (!updated) {
        return NextResponse.json({ error: "Flow not found" }, { status: 404 });
      }

      return NextResponse.json({ flow: updated }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens"
          ? 401
          : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  const DELETE = async (request: Request, context: { params: { flowId: string } }) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();
    const flowId = context.params?.flowId?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    if (!flowId) {
      return NextResponse.json({ error: "Missing flowId" }, { status: 400 });
    }

    try {
      await removeCashFlow({ spreadsheetId, flowId });
      return new NextResponse(null, { status: 204 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens"
          ? 401
          : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET, POST, PATCH, DELETE };
}
