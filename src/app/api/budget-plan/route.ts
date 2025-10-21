// ABOUTME: Serves budget plan records from the spreadsheet via API.
// ABOUTME: Validates spreadsheet identifier query string and proxies repository data.
import { NextResponse } from "next/server";

import { getSession } from "../../../server/auth/session";
import { createSheetsClient } from "../../../server/google/clients";
import {
  createBudgetPlanRepository,
  type BudgetPlanRecord,
} from "../../../server/google/repository/budget-plan-repository";

interface FetchBudgetPlanOptions {
  spreadsheetId: string;
}

type FetchBudgetPlan = (options: FetchBudgetPlanOptions) => ReturnType<
  ReturnType<typeof createBudgetPlanRepository>["list"]
>;

async function fetchBudgetPlanFromSheets({ spreadsheetId }: FetchBudgetPlanOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const repository = createBudgetPlanRepository({ sheets, spreadsheetId });

  return repository.list();
}

interface SaveBudgetPlanOptions extends FetchBudgetPlanOptions {
  budgetPlan: BudgetPlanRecord[];
}

type SaveBudgetPlan = (options: SaveBudgetPlanOptions) => Promise<void>;

async function saveBudgetPlanToSheets({
  spreadsheetId,
  budgetPlan,
}: SaveBudgetPlanOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const repository = createBudgetPlanRepository({ sheets, spreadsheetId });

  await repository.save(budgetPlan);
}

function parseBudgetPlanPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const rawBudgetPlan = payload.budgetPlan;

  if (!Array.isArray(rawBudgetPlan)) {
    return null;
  }

  const records: BudgetPlanRecord[] = [];

  for (let index = 0; index < rawBudgetPlan.length; index += 1) {
    const item = rawBudgetPlan[index];

    if (!item || typeof item !== "object") {
      return null;
    }

    const {
      recordId,
      categoryId,
      month,
      year,
      amount,
      rolloverBalance,
    } = item as Record<string, unknown>;

    if (typeof recordId !== "string" || !recordId.trim()) {
      return null;
    }

    if (typeof categoryId !== "string" || !categoryId.trim()) {
      return null;
    }

    if (typeof month !== "number" || !Number.isInteger(month)) {
      return null;
    }

    if (typeof year !== "number" || !Number.isInteger(year)) {
      return null;
    }

    if (typeof amount !== "number" || Number.isNaN(amount)) {
      return null;
    }

    if (typeof rolloverBalance !== "number" || Number.isNaN(rolloverBalance)) {
      return null;
    }

    records.push({
      recordId: recordId.trim(),
      categoryId: categoryId.trim(),
      month,
      year,
      amount,
      rolloverBalance,
    });
  }

  return records;
}

export function createBudgetPlanHandler({
  fetchBudgetPlan = fetchBudgetPlanFromSheets,
  saveBudgetPlan = saveBudgetPlanToSheets,
}: {
  fetchBudgetPlan?: FetchBudgetPlan;
  saveBudgetPlan?: SaveBudgetPlan;
} = {}) {
  const GET = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const budgetPlan = await fetchBudgetPlan({ spreadsheetId });

      return NextResponse.json({ budgetPlan }, { status: 200 });
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

    let budgetPlan: BudgetPlanRecord[] | null = null;

    try {
      const payload = await request.json();
      budgetPlan = parseBudgetPlanPayload(payload);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!budgetPlan) {
      return NextResponse.json({ error: "Missing budgetPlan payload" }, { status: 400 });
    }

    try {
      await saveBudgetPlan({ spreadsheetId, budgetPlan });
      return NextResponse.json({ budgetPlan }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET, POST };
}

const handlers = createBudgetPlanHandler();

export const GET = handlers.GET;
export const POST = handlers.POST;

export type { FetchBudgetPlanOptions };
