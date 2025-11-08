// ABOUTME: Wraps the budget plan hook with the presentational grid.
// ABOUTME: Provides heading and context-aware messaging for the planner.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import {
  filterSheetIssues,
  shouldReloadAfterBootstrap,
  shouldRetryAfterRecovery,
} from "@/components/spreadsheet/spreadsheet-health-helpers";
import {
  loadManifest,
  manifestStorageKey,
  type ManifestRecord,
} from "@/lib/manifest-store";
import { subscribeToManifestChange } from "@/lib/manifest-events";

import { BudgetPlanGrid } from "./budget-plan-grid";
import { useBudgetPlan } from "./use-budget-plan";

const BUDGET_PLAN_SHEET_ID = "budget_plan";

export function BudgetPlanManager() {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
  const previousManifestStoredAtRef = useRef<number | null>(null);
  const previousHealthBlockedRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateManifest = () => {
      const stored = loadManifest(window.localStorage);
      setManifest(stored);
    };

    updateManifest();

    const unsubscribe = subscribeToManifestChange((record) => {
      setManifest(record as ManifestRecord | null);
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === manifestStorageKey()) {
        updateManifest();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      unsubscribe();
    };
  }, []);

  const spreadsheetId = manifest?.spreadsheetId ?? null;
  const manifestStoredAt = manifest?.storedAt ?? null;

  const { diagnostics } = useSpreadsheetHealth();
  const budgetHealth = useMemo(
    () =>
      filterSheetIssues(diagnostics, {
        sheetId: BUDGET_PLAN_SHEET_ID,
        fallbackTitle: "Budget plan",
      }),
    [diagnostics],
  );

  const blockingMessage = budgetHealth.hasErrors
    ? `Spreadsheet health flagged issues with the ${budgetHealth.sheetTitle} tab. Fix the problems above, then reload.`
    : null;

  const manager = useBudgetPlan(spreadsheetId, {
    isBlocked: budgetHealth.hasErrors,
    blockingMessage,
  });
  const refresh = manager.refresh;

  useEffect(() => {
    if (!spreadsheetId) {
      return;
    }

    const previousBlocked = previousHealthBlockedRef.current;
    previousHealthBlockedRef.current = budgetHealth.hasErrors;

    if (shouldRetryAfterRecovery(previousBlocked, budgetHealth.hasErrors)) {
      void refresh();
    }
  }, [budgetHealth.hasErrors, refresh, spreadsheetId]);

  useEffect(() => {
    const previousStoredAt = previousManifestStoredAtRef.current;
    previousManifestStoredAtRef.current = manifestStoredAt;

    if (!spreadsheetId) {
      return;
    }

    if (shouldReloadAfterBootstrap(previousStoredAt, manifestStoredAt)) {
      void refresh();
    }
  }, [manifestStoredAt, refresh, spreadsheetId]);

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
