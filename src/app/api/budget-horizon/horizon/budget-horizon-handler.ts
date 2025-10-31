// ABOUTME: Shared handler for budget horizon mutations (expand/shrink/apply).
// ABOUTME: Enables testing via dependency injection while keeping route exports clean.
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import {
  createBudgetPlanRepository,
  type BudgetHorizonMetadata,
  type BudgetPlanRecord,
} from "@/server/google/repository/budget-horizon-repository";

const VALID_ACTIONS = new Set(["expand", "shrink", "apply"]);

export interface HorizonActionOptions {
  spreadsheetId: string;
  action: string;
  metadata: BudgetHorizonMetadata;
}

interface ApplyHorizonResult {
  metadata: BudgetHorizonMetadata;
  records: BudgetPlanRecord[];
}

type ApplyHorizon = (options: HorizonActionOptions) => Promise<ApplyHorizonResult>;

function parseMetadata(value: unknown): BudgetHorizonMetadata | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const start = typeof payload.start === "string" ? payload.start.trim() : "";
  const months =
    typeof payload.months === "number"
      ? payload.months
      : typeof payload.months === "string"
        ? Number.parseInt(payload.months, 10)
        : Number.NaN;

  if (!start || Number.isNaN(months)) {
    return null;
  }

  return {
    start,
    months,
  };
}

async function applyHorizonFromSheets({ spreadsheetId, action, metadata }: HorizonActionOptions) {
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

  if (action === "expand" || action === "apply") {
    await repository.expandHorizon(metadata);
  } else if (action === "shrink") {
    await repository.shrinkHorizon(metadata);
  } else {
    throw new Error(`Unsupported action: ${action}`);
  }

  const result = await repository.load();

  return {
    metadata: result.metadata,
    records: result.records,
  };
}

export function createBudgetHorizonHandler({
  applyHorizon = applyHorizonFromSheets,
}: { applyHorizon?: ApplyHorizon } = {}) {
  const POST = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const input = payload as Record<string, unknown>;
    const action = typeof input.action === "string" ? input.action.trim() : "";
    const metadata = parseMetadata(input.meta);

    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (!metadata) {
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
    }

    try {
      const result = await applyHorizon({ spreadsheetId, action, metadata });

      return NextResponse.json(
        { budgetPlan: result.records, meta: result.metadata },
        { status: 200 },
      );
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
