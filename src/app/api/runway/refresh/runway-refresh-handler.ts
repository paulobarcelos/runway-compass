// ABOUTME: Handles POST requests to rebuild runway projections server-side.
// ABOUTME: Wires repositories into the projection refresher service.
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import { createBudgetPlanRepository } from "@/server/google/repository/budget-plan-repository";
import { createCashFlowRepository } from "@/server/google/repository/cash-flow-repository";
import { createSnapshotsRepository } from "@/server/google/repository/snapshots-repository";
import { createAccountsRepository } from "@/server/google/repository/accounts-repository";
import { createRunwayProjectionRepository } from "@/server/google/repository/runway-projection-repository";
import {
  createRunwayProjectionRefresher,
  type RunwayProjectionRefreshResult,
} from "@/server/projection/runway-projection-refresh";

export interface RefreshRunwayProjectionOptions {
  spreadsheetId: string;
}

type RefreshRunwayProjection = (
  options: RefreshRunwayProjectionOptions,
) => Promise<RunwayProjectionRefreshResult>;

async function refreshRunwayProjectionFromSheets({
  spreadsheetId,
}: RefreshRunwayProjectionOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);

  const refresher = createRunwayProjectionRefresher({
    loadBudgets: async ({ spreadsheetId: id }) =>
      createBudgetPlanRepository({ sheets, spreadsheetId: id }).list(),
    loadCashFlows: async ({ spreadsheetId: id }) =>
      createCashFlowRepository({ sheets, spreadsheetId: id }).list(),
    loadSnapshots: async ({ spreadsheetId: id }) =>
      createSnapshotsRepository({ sheets, spreadsheetId: id }).list(),
    loadAccounts: async ({ spreadsheetId: id }) =>
      createAccountsRepository({ sheets, spreadsheetId: id }).listWithDiagnostics(),
    saveProjection: async ({ spreadsheetId: id, rows }) =>
      createRunwayProjectionRepository({ sheets, spreadsheetId: id }).save(rows),
  });

  return refresher({ spreadsheetId });
}

export function createRunwayRefreshHandler({
  refreshProjection = refreshRunwayProjectionFromSheets,
}: { refreshProjection?: RefreshRunwayProjection } = {}) {
  const POST = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const result = await refreshProjection({ spreadsheetId });
      return NextResponse.json(result, { status: 202 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens"
          ? 401
          : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { POST };
}
