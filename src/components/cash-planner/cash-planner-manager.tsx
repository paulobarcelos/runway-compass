// ABOUTME: Connects the cash planner hook with the ledger UI and health context.
// ABOUTME: Renders section heading plus status-aware description for the ledger.
"use client";

import { useMemo } from "react";

import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import { CashPlannerLedger } from "./cash-planner-ledger";
import { useCashPlannerManager } from "./use-cash-planner-manager";

export function CashPlannerManager() {
  const { spreadsheetId } = useSpreadsheetHealth();
  const manager = useCashPlannerManager({ spreadsheetId });

  const statusLabel = useMemo(() => {
    if (manager.status === "loading") {
      return "Loading cash planner…";
    }

    if (manager.status === "blocked") {
      return "Cash planner requires a connected sheet";
    }

    if (manager.status === "error") {
      return "Cash planner error";
    }

    return "Cash planner";
  }, [manager.status]);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{statusLabel}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Track planned income and expenses alongside posted cash to understand runway impact.
        </p>
      </header>
      <CashPlannerLedger manager={manager} />
    </section>
  );
}
