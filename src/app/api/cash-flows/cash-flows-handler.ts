// ABOUTME: Provides testable handlers for the cash flows API endpoints.
// ABOUTME: Validates payloads and bridges HTTP to the Sheets repository.
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import {
  createCashFlowRepository,
  type CashFlowRecord,
} from "@/server/google/repository/cash-flow-repository";

interface FetchCashFlowsOptions {
  spreadsheetId: string;
}

type FetchCashFlows = (options: FetchCashFlowsOptions) => Promise<CashFlowRecord[]>;

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

interface SaveCashFlowsOptions extends FetchCashFlowsOptions {
  flows: CashFlowRecord[];
}

type SaveCashFlows = (options: SaveCashFlowsOptions) => Promise<void>;

async function saveCashFlowsToSheets({ spreadsheetId, flows }: SaveCashFlowsOptions) {
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

  await repository.save(flows);
}

function parseCashFlowsPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const rawFlows = payload.flows;

  if (!Array.isArray(rawFlows)) {
    return null;
  }

  const flows: CashFlowRecord[] = [];

  for (let index = 0; index < rawFlows.length; index += 1) {
    const item = rawFlows[index];

    if (!item || typeof item !== "object") {
      return null;
    }

    const {
      flowId,
      type,
      categoryId,
      plannedDate,
      plannedAmount,
      actualDate,
      actualAmount,
      status,
      accountId,
      note,
    } = item as Record<string, unknown>;

    if (typeof flowId !== "string" || !flowId.trim()) {
      return null;
    }

    if (typeof type !== "string" || !type.trim()) {
      return null;
    }

    if (typeof plannedDate !== "string" || !plannedDate.trim()) {
      return null;
    }

    if (typeof plannedAmount !== "number" || !Number.isFinite(plannedAmount)) {
      return null;
    }

    if (typeof status !== "string" || !status.trim()) {
      return null;
    }

    const sanitizedActualAmount =
      typeof actualAmount === "number" && Number.isFinite(actualAmount) ? actualAmount : 0;

    flows.push({
      flowId: flowId.trim(),
      type: type.trim(),
      categoryId: typeof categoryId === "string" ? categoryId.trim() : "",
      plannedDate: plannedDate.trim(),
      plannedAmount,
      actualDate: typeof actualDate === "string" ? actualDate.trim() : "",
      actualAmount: sanitizedActualAmount,
      status: status.trim(),
      accountId: typeof accountId === "string" ? accountId.trim() : "",
      note: typeof note === "string" ? note.trim() : "",
    });
  }

  return flows;
}

export function createCashFlowsHandler({
  fetchCashFlows = fetchCashFlowsFromSheets,
  saveCashFlows = saveCashFlowsToSheets,
}: {
  fetchCashFlows?: FetchCashFlows;
  saveCashFlows?: SaveCashFlows;
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

    let flows: CashFlowRecord[] | null = null;

    try {
      const payload = await request.json();
      flows = parseCashFlowsPayload(payload);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!flows) {
      return NextResponse.json({ error: "Missing flows payload" }, { status: 400 });
    }

    try {
      await saveCashFlows({ spreadsheetId, flows });
      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens"
          ? 401
          : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET, POST };
}
