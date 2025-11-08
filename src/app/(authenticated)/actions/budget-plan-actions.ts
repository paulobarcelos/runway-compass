"use server";

import { createBudgetPlanActions } from "@/server/budget-plan/budget-plan-service";

const actions = createBudgetPlanActions();

export const getBudgetPlan = actions.getBudgetPlan;
export const saveBudgetPlan = actions.saveBudgetPlan;
