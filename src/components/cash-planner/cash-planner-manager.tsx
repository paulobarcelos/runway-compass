// ABOUTME: Connects the cash planner hook with the ledger UI and health context.
// ABOUTME: Aligns layout with the accounts manager, including shared headers and action rows.
"use client";

import { useCallback, useMemo } from "react";

import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import {
  buildSheetUrl,
  filterSheetIssues,
} from "@/components/spreadsheet/spreadsheet-health-helpers";
import { CashPlannerLedger } from "./cash-planner-ledger";
import { useCashPlannerManager } from "./use-cash-planner-manager";

function formatCurrency(amount: number) {
  if (!Number.isFinite(amount)) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

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

  const totals = useMemo(() => {
    return manager.flows.reduce(
      (accumulator, flow) => {
        if (flow.status === "planned") {
          accumulator.planned += flow.plannedAmount;
        } else if (flow.status === "posted") {
          accumulator.posted += flow.actualAmount ?? flow.plannedAmount;
        } else if (flow.status === "void") {
          accumulator.voided += flow.plannedAmount;
        }

        return accumulator;
      },
      { planned: 0, posted: 0, voided: 0 },
    );
  }, [manager.flows]);

  const lastSavedLabel =
    manager.status === "ready" ? formatTimestamp(manager.lastSavedAt) : null;

  const refreshDisabled = manager.isSaving || manager.status === "loading";
  const saveDisabled =
    manager.status !== "ready" || manager.isSaving || !manager.isDirty || cashFlowsHealth.hasErrors;

  const handleReload = useCallback(() => {
    void manager.reload();
  }, [manager]);

  const handleSave = useCallback(async () => {
    try {
      await manager.save();
    } catch (saveError) {
      console.error(saveError);
    }
  }, [manager]);

  const showHealthBanner = cashFlowsHealth.hasErrors && !!healthBlockedMessage;
  const showErrorBanner = !showHealthBanner && manager.status === "error" && manager.error;
  const showLoading = manager.status === "loading";
  const showLedger = manager.status === "ready";
  const hasWarnings = !cashFlowsHealth.hasErrors && cashFlowsHealth.warnings.length > 0;

  if (!spreadsheetId) {
    return (
      <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
        Connect a spreadsheet to manage cash flows.
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Cash planner</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Track planned income and expenses alongside posted cash to understand runway impact.
            </p>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="mr-3">Projected total: {formatCurrency(totals.planned)}</span>
            <span className="mr-3">Posted total: {formatCurrency(totals.posted)}</span>
            <span>Voided total: {formatCurrency(totals.voided)}</span>
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
      </div>

      {showHealthBanner ? (
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
      ) : null}

      {showErrorBanner ? (
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
      ) : null}

      {!showHealthBanner && hasWarnings ? (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/70 p-4 text-xs text-amber-700 shadow-sm shadow-amber-900/10 dark:border-amber-500/60 dark:bg-amber-900/30 dark:text-amber-100">
          Spreadsheet health listed non-blocking warnings for cash flows. Clearing them keeps the ledger in sync.
        </div>
      ) : null}

      {showLoading ? (
        <div className="rounded-lg border border-zinc-200/70 bg-white/70 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
          Loading cash planner…
        </div>
      ) : null}

      {showLedger ? <CashPlannerLedger manager={manager} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {lastSavedLabel ? `Last saved ${lastSavedLabel}` : ""}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReload}
            disabled={refreshDisabled}
            className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveDisabled}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {manager.isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}
