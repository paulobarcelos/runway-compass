// ABOUTME: Connects the cash planner hook with the ledger UI and health context.
// ABOUTME: Renders section heading plus status-aware description for the ledger.
"use client";

import { useMemo, useCallback } from "react";

import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import {
  buildSheetUrl,
  filterSheetIssues,
} from "@/components/spreadsheet/spreadsheet-health-helpers";
import { CashPlannerLedger } from "./cash-planner-ledger";
import { useCashPlannerManager } from "./use-cash-planner-manager";

export function CashPlannerManager() {
  const { spreadsheetId, diagnostics: healthDiagnostics } = useSpreadsheetHealth();
  const cashFlowsHealth = useMemo(
    () =>
      filterSheetIssues(healthDiagnostics, {
        sheetId: "cash_flows",
        fallbackTitle: "Cash flows",
      }),
    [healthDiagnostics],
  );
  const cashFlowsSheetUrl = useMemo(
    () => buildSheetUrl(spreadsheetId, cashFlowsHealth.sheetGid),
    [cashFlowsHealth.sheetGid, spreadsheetId],
  );
  const healthBlockedMessage = cashFlowsHealth.hasErrors
    ? `Spreadsheet health flagged issues with the ${cashFlowsHealth.sheetTitle} tab. Fix the problems above, then reload.`
    : null;

  const manager = useCashPlannerManager({
    spreadsheetId,
    disabled: cashFlowsHealth.hasErrors,
    disabledMessage: healthBlockedMessage,
  });

  const handleReload = useCallback(() => {
    void manager.reload();
  }, [manager]);

  const showHealthBanner = cashFlowsHealth.hasErrors && !!healthBlockedMessage;
  const showErrorBanner = !showHealthBanner && manager.status === "error" && manager.error;
  const showConnectBanner = !showHealthBanner && !showErrorBanner && manager.status === "blocked" && !spreadsheetId;

  const renderBanner = () => {
    if (showHealthBanner) {
      return (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/40 dark:text-rose-100">
          <p>{healthBlockedMessage}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleReload}
              className="inline-flex items-center rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reload cash planner
            </button>
            {cashFlowsSheetUrl ? (
              <a
                href={cashFlowsSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-rose-300/60 bg-transparent px-4 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-600/60 dark:text-rose-100 dark:hover:bg-rose-900/40"
              >
                Open in Google Sheets
              </a>
            ) : null}
          </div>
        </div>
      );
    }

    if (showErrorBanner) {
      return (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/40 dark:text-rose-100">
          <p>{manager.error}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleReload}
              className="inline-flex items-center rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500"
            >
              Retry loading
            </button>
            {cashFlowsSheetUrl ? (
              <a
                href={cashFlowsSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-rose-300/60 bg-transparent px-4 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-600/60 dark:text-rose-100 dark:hover:bg-rose-900/40"
              >
                Open in Google Sheets
              </a>
            ) : null}
          </div>
        </div>
      );
    }

    if (showConnectBanner) {
      return (
        <div className="rounded-lg border border-amber-300/70 bg-amber-50/80 p-4 text-sm text-amber-800 shadow-sm dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-100">
          <p>{manager.blockingMessage ?? "Connect a spreadsheet to manage cash flows."}</p>
        </div>
      );
    }

    return null;
  };

  const renderBody = () => {
    if (!spreadsheetId) {
      return null;
    }

    if (manager.status === "loading") {
      return (
        <div className="rounded-lg border border-zinc-200/70 bg-white/70 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
          Loading cash planner…
        </div>
      );
    }

    if (manager.status !== "ready") {
      return null;
    }

    return <CashPlannerLedger manager={manager} />;
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Cash planner</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Track planned income and expenses alongside posted cash to understand runway impact.
          </p>
        </div>
        {cashFlowsSheetUrl ? (
          <a
            href={cashFlowsSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Open in Google Sheets
          </a>
        ) : null}
      </header>

      {renderBanner()}

      {renderBody()}
    </section>
  );
}
