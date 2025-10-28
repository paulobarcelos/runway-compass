// ABOUTME: Connects the cash planner hook with the ledger UI and health context.
// ABOUTME: Renders section heading plus status-aware description for the ledger.
"use client";

import { useMemo } from "react";

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

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
              className="rounded border border-zinc-300/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-800 dark:border-zinc-700/60 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
            >
              Open in Google Sheets
            </a>
          ) : null}
        </div>
        {cashFlowsHealth.hasErrors ? (
          <p className="rounded-md border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 shadow-sm dark:border-rose-600/50 dark:bg-rose-900/20 dark:text-rose-100">
            {healthBlockedMessage}
          </p>
        ) : null}
      </header>
      <CashPlannerLedger manager={manager} />
    </section>
  );
}
