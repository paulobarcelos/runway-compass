// ABOUTME: Connects budget horizon route exports to the shared handler.
// ABOUTME: Ensures only HTTP verbs are exported for routing compliance.
import { createBudgetHorizonHandler } from "./budget-horizon-handler";

const handlers = createBudgetHorizonHandler();

export const POST = handlers.POST;
