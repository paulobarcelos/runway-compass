// ABOUTME: Wraps budget plan API calls for client-side usage.
// ABOUTME: Normalizes responses and raises typed errors for failures.
import type {
  BudgetHorizonMetadata,
  BudgetPlanRecord,
} from "@/server/google/repository/budget-horizon-repository";

const FETCH_ERROR_MESSAGE = "Failed to fetch budget plan";
const SAVE_ERROR_MESSAGE = "Failed to save budget plan";

export class BudgetPlanClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BudgetPlanClientError";
    this.status = status;
  }
}

function ensureSpreadsheetId(value: string) {
  if (!value || !value.trim()) {
    throw new Error("Missing spreadsheetId");
  }

  return value.trim();
}

export interface BudgetPlanResponse {
  budgetPlan: BudgetPlanRecord[];
  meta: BudgetHorizonMetadata;
}

async function parseBudgetPlanPayload(response: Response, defaultMessage: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    budgetPlan?: unknown;
    meta?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    const message =
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : defaultMessage;

    throw new BudgetPlanClientError(response.status, message);
  }

  const records = Array.isArray(payload?.budgetPlan) ? payload.budgetPlan : [];
  const meta = payload?.meta && typeof payload.meta === "object" ? payload.meta : null;

  if (!meta) {
    throw new BudgetPlanClientError(response.status, defaultMessage);
  }

  return {
    budgetPlan: records as BudgetPlanRecord[],
    meta: meta as BudgetHorizonMetadata,
  };
}

export async function fetchBudgetPlan(
  spreadsheetId: string,
): Promise<BudgetPlanResponse> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/budget-plan?spreadsheetId=${encodeURIComponent(normalizedId)}`,
  );

  return parseBudgetPlanPayload(response, FETCH_ERROR_MESSAGE);
}

export async function saveBudgetPlan(
  spreadsheetId: string,
  budgetPlan: BudgetPlanRecord[],
  metadata: BudgetHorizonMetadata,
): Promise<BudgetPlanResponse> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/budget-plan?spreadsheetId=${encodeURIComponent(normalizedId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ budgetPlan, meta: metadata }),
    },
  );

  return parseBudgetPlanPayload(response, SAVE_ERROR_MESSAGE);
}
