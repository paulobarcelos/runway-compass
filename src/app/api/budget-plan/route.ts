// ABOUTME: Serves budget plan records from the spreadsheet via API.
// ABOUTME: Validates spreadsheet identifier query string and proxies repository data.
import { NextResponse } from "next/server";

import { getSession } from "../../../server/auth/session";
import { createSheetsClient } from "../../../server/google/clients";
import { createBudgetPlanRepository } from "../../../server/google/repository/budget-plan-repository";

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

export function createBudgetPlanHandler({
  fetchBudgetPlan = fetchBudgetPlanFromSheets,
}: {
  fetchBudgetPlan?: FetchBudgetPlan;
} = {}) {
  return async function GET(request: Request) {
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
}

export const GET = createBudgetPlanHandler();

export type { FetchBudgetPlanOptions };
