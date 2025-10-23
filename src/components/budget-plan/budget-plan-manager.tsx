// ABOUTME: Wraps the budget plan hook with the presentational grid.
// ABOUTME: Provides heading and context-aware messaging for the planner.
"use client";

import { useMemo } from "react";

import { BudgetPlanGrid } from "./budget-plan-grid";
import { useBudgetPlanManager } from "./use-budget-plan-manager";

export function BudgetPlanManager() {
  const manager = useBudgetPlanManager();
  const statusLabel = useMemo(() => {
    if (manager.status === "loading") {
      return "Fetching budget plan…";
    }

    if (manager.status === "blocked") {
      return "Budget plan unavailable";
    }

    if (manager.status === "error") {
      return "Budget plan error";
    }

    return "Budget plan";
  }, [manager.status]);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {statusLabel}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Allocate monthly budgets per category and keep rollover balances in sync.
        </p>
      </header>
      <BudgetPlanGrid manager={manager} />
    </section>
  );
}
