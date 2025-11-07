// ABOUTME: Stub server actions for budget plan hook tests with controllable outputs.
import type { BudgetPlanRecord, BudgetHorizonMetadata } from "@/server/google/repository/budget-horizon-repository";

interface BudgetPlanPayload {
  budgetPlan: BudgetPlanRecord[];
  metadata: BudgetHorizonMetadata;
  updatedAt: string;
}

let nextGetResponse: BudgetPlanPayload = {
  budgetPlan: [],
  metadata: { start: "2024-01-01", months: 12 },
  updatedAt: new Date().toISOString(),
};
let nextSaveResponse: BudgetPlanPayload | null = null;
let nextGetError: Error | null = null;
let nextSaveError: Error | null = null;
const getCalls: string[] = [];
const saveCalls: Array<{
  spreadsheetId: string;
  budgetPlan: BudgetPlanRecord[];
  metadata: BudgetHorizonMetadata;
}> = [];

function cloneRecords(records: BudgetPlanRecord[]): BudgetPlanRecord[] {
  return records.map((record) => ({ ...record }));
}

function cloneMetadata(metadata: BudgetHorizonMetadata): BudgetHorizonMetadata {
  return { ...metadata };
}

function clonePayload(payload: BudgetPlanPayload): BudgetPlanPayload {
  return {
    budgetPlan: cloneRecords(payload.budgetPlan),
    metadata: cloneMetadata(payload.metadata),
    updatedAt: payload.updatedAt,
  };
}

export function __setBudgetPlanGetResponse(payload: BudgetPlanPayload) {
  nextGetResponse = clonePayload(payload);
  nextGetError = null;
}

export function __setBudgetPlanGetError(error: Error) {
  nextGetError = error;
}

export function __setBudgetPlanSaveResponse(payload: BudgetPlanPayload | null) {
  nextSaveResponse = payload ? clonePayload(payload) : null;
  nextSaveError = null;
}

export function __setBudgetPlanSaveError(error: Error) {
  nextSaveError = error;
}

export function __resetBudgetPlanActionsStub() {
  nextGetResponse = {
    budgetPlan: [],
    metadata: { start: "2024-01-01", months: 12 },
    updatedAt: new Date().toISOString(),
  };
  nextSaveResponse = null;
  nextGetError = null;
  nextSaveError = null;
  getCalls.length = 0;
  saveCalls.length = 0;
}

export function __getBudgetPlanCalls(): string[] {
  return getCalls.slice();
}

export function __getBudgetPlanSavePayloads() {
  return saveCalls.map((entry) => ({
    spreadsheetId: entry.spreadsheetId,
    budgetPlan: cloneRecords(entry.budgetPlan),
    metadata: cloneMetadata(entry.metadata),
  }));
}

export async function getBudgetPlan({ spreadsheetId }: { spreadsheetId: string }) {
  getCalls.push(spreadsheetId);

  if (nextGetError) {
    throw nextGetError;
  }

  return clonePayload(nextGetResponse);
}

export async function saveBudgetPlan({
  spreadsheetId,
  budgetPlan,
  metadata,
}: {
  spreadsheetId: string;
  budgetPlan: BudgetPlanRecord[];
  metadata: BudgetHorizonMetadata;
}) {
  // console.log can be noisy; keep silent unless debugging.
  if (process.env.DEBUG_BUDGET_PLAN_TEST === "1") {
    console.log("[budget-plan-actions-stub] save", spreadsheetId, budgetPlan.length);
  }
  saveCalls.push({
    spreadsheetId,
    budgetPlan: cloneRecords(budgetPlan),
    metadata: cloneMetadata(metadata),
  });

  if (nextSaveError) {
    throw nextSaveError;
  }

  if (nextSaveResponse) {
    return clonePayload(nextSaveResponse);
  }

  return {
    budgetPlan: cloneRecords(budgetPlan),
    metadata: cloneMetadata(metadata),
    updatedAt: new Date().toISOString(),
  };
}
