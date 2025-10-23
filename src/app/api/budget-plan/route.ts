// ABOUTME: Connects Next.js budget plan route exports to the shared handler.
// ABOUTME: Ensures only HTTP verbs are exported for routing compliance.
import { createBudgetPlanHandler } from "./budget-plan-handler";

const handlers = createBudgetPlanHandler();

export const GET = handlers.GET;
export const POST = handlers.POST;

export type { FetchBudgetPlanOptions } from "./budget-plan-handler";
