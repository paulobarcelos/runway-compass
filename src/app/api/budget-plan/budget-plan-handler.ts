// ABOUTME: Shared handler factory for budget plan API routes.
// ABOUTME: Enables testing with dependency injection while keeping route exports clean.
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import {
  createBudgetPlanRepository,
  type BudgetPlanRecord,
  type BudgetHorizonMetadata,
} from "@/server/google/repository/budget-horizon-repository";

interface FetchBudgetPlanOptions {
  spreadsheetId: string;
}

type FetchBudgetPlan = (options: FetchBudgetPlanOptions) => ReturnType<
  ReturnType<typeof createBudgetPlanRepository>["load"]
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

  return repository.load();
}

interface SaveBudgetPlanOptions extends FetchBudgetPlanOptions {
  budgetPlan: BudgetPlanRecord[];
  metadata: BudgetHorizonMetadata;
}

type SaveBudgetPlan = (options: SaveBudgetPlanOptions) => Promise<void>;

async function saveBudgetPlanToSheets({
  spreadsheetId,
  budgetPlan,
  metadata,
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

  await repository.save(budgetPlan, metadata);
}

function parseMetadata(value: unknown): BudgetHorizonMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const startRaw = typeof payload.start === "string" ? payload.start.trim() : "";
  const monthsRaw =
    typeof payload.months === "number"
      ? payload.months
      : typeof payload.months === "string"
        ? Number.parseInt(payload.months, 10)
        : NaN;

  if (!startRaw || Number.isNaN(monthsRaw)) {
    return null;
  }

  return {
    start: startRaw,
    months: monthsRaw,
  };
}

function parseBudgetPlanPayload(value: unknown):
  | { records: BudgetPlanRecord[]; metadata: BudgetHorizonMetadata }
  | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const rawBudgetPlan = payload.budgetPlan;
  const parsedMetadata = parseMetadata(payload.meta);

  if (!Array.isArray(rawBudgetPlan) || !parsedMetadata) {
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
      currency,
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

    if (typeof currency !== "string") {
      return null;
    }

    records.push({
      recordId: recordId.trim(),
      categoryId: categoryId.trim(),
      month,
      year,
      amount,
      rolloverBalance,
      currency: currency.trim(),
    });
  }

  return {
    records,
    metadata: parsedMetadata,
  };
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

      return NextResponse.json(
        { budgetPlan: budgetPlan.records, meta: budgetPlan.metadata },
        { status: 200 },
      );
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

    let rawPayload: unknown;

    try {
      rawPayload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const payload =
      parseBudgetPlanPayload(rawPayload) as
        | {
            records: BudgetPlanRecord[];
            metadata: BudgetHorizonMetadata;
          }
        | null;

    if (!payload) {
      return NextResponse.json(
        { error: "Missing budgetPlan or metadata payload" },
        { status: 400 },
      );
    }

    try {
      await saveBudgetPlan({
        spreadsheetId,
        budgetPlan: payload.records,
        metadata: payload.metadata,
      });
      return NextResponse.json(
        { budgetPlan: payload.records, meta: payload.metadata },
        { status: 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET, POST };
}

export type { FetchBudgetPlanOptions };
