// ABOUTME: Coordinates ledger metadata, filters, and inline table component.
"use client";

import { useMemo, useState } from "react";

import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import {
  buildSheetUrl,
  filterSheetIssues,
} from "@/components/spreadsheet/spreadsheet-health-helpers";
import { useCashPlannerManager } from "./use-cash-planner-manager";
import { useCashPlannerMetadata } from "./use-cash-planner-metadata";
import { CashPlannerLedger } from "./cash-planner-ledger";
import type { CashFlowStatus } from "@/server/google/repository/cash-flow-repository";

export function CashPlannerManager() {
  const { spreadsheetId, diagnostics: healthDiagnostics } = useSpreadsheetHealth();

  const ledgerHealth = useMemo(
    () =>
      filterSheetIssues(healthDiagnostics, {
        sheetId: "cash_flows",
        fallbackTitle: "Ledger",
      }),
    [healthDiagnostics],
  );

  const ledgerSheetUrl = useMemo(
    () => buildSheetUrl(spreadsheetId, ledgerHealth.sheetGid),
    [ledgerHealth.sheetGid, spreadsheetId],
  );

  const healthBlockedMessage = ledgerHealth.hasErrors
    ? `Spreadsheet health flagged issues with the ${ledgerHealth.sheetTitle} tab. Fix the problems above, then reload.`
    : null;

  const manager = useCashPlannerManager({
    spreadsheetId,
    disabled: ledgerHealth.hasErrors,
    disabledMessage: healthBlockedMessage,
  });

  const metadata = useCashPlannerMetadata({
    spreadsheetId,
    disabled: ledgerHealth.hasErrors,
    disabledMessage: healthBlockedMessage,
    entries: manager.entries,
  });

  const [statusFilter, setStatusFilter] = useState<"all" | CashFlowStatus>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredEntries = useMemo(() => {
    return manager.entries.filter((entry) => {
      if (statusFilter !== "all" && entry.status !== statusFilter) {
        return false;
      }

      if (accountFilter !== "all" && entry.accountId !== accountFilter) {
        return false;
      }

      if (categoryFilter !== "all" && entry.categoryId !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [manager.entries, statusFilter, accountFilter, categoryFilter]);

  const hasOrphans = metadata.orphanEntryLookup.size > 0;

  const showHealthBanner = ledgerHealth.hasErrors && !!healthBlockedMessage;
  const showErrorBanner = !showHealthBanner && manager.status === "error" && manager.error;
  const hasWarnings = !ledgerHealth.hasErrors && ledgerHealth.warnings.length > 0;

  const statusButtonClass = (value: "all" | CashFlowStatus) =>
    value === statusFilter
      ? "rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm"
      : "rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800";

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Ledger</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Track planned and posted cash entries inline by account and category.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ledgerSheetUrl ? (
            <a
              href={ledgerSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Open in Google Sheets
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void manager.reload()}
            disabled={manager.status === "loading" || manager.isSaving}
            className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-2">
          <span>Status</span>
          <button type="button" className={statusButtonClass("all")} onClick={() => setStatusFilter("all")}>
            All
          </button>
          <button
            type="button"
            className={statusButtonClass("planned")}
            onClick={() => setStatusFilter("planned")}
          >
            Planned
          </button>
          <button
            type="button"
            className={statusButtonClass("posted")}
            onClick={() => setStatusFilter("posted")}
          >
            Posted
          </button>
        </div>
        <label className="flex items-center gap-2">
          <span>Account</span>
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            value={accountFilter}
            onChange={(event) => setAccountFilter(event.target.value)}
          >
            <option value="all">All accounts</option>
            {metadata.accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span>Category</span>
          <select
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">All categories</option>
            {metadata.categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showHealthBanner ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/40 dark:text-rose-100">
          <p>{healthBlockedMessage}</p>
        </div>
      ) : null}

      {showErrorBanner ? (
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/80 p-4 text-sm text-amber-700 shadow-sm shadow-amber-900/10 dark:border-amber-500/60 dark:bg-amber-900/30 dark:text-amber-100">
          {manager.error}
        </div>
      ) : null}

      {!showHealthBanner && hasWarnings ? (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/70 p-4 text-xs text-amber-700 shadow-sm shadow-amber-900/10 dark:border-amber-500/60 dark:bg-amber-900/30 dark:text-amber-100">
          Spreadsheet health listed non-blocking warnings for the ledger. Clearing them keeps the data aligned.
        </div>
      ) : null}

      {manager.status === "loading" ? (
        <div className="rounded-lg border border-zinc-200/70 bg-white/70 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
          Loading ledger entries…
        </div>
      ) : null}

      {hasOrphans ? (
        <div className="rounded-lg border border-amber-200/70 bg-amber-50/80 p-4 text-xs text-amber-700 shadow-sm shadow-amber-900/10 dark:border-amber-600/60 dark:bg-amber-900/30 dark:text-amber-100">
          Some entries reference accounts or categories that no longer exist. Update them to ensure they are included in projections.
        </div>
      ) : null}

      {manager.status === "ready" ? (
        <CashPlannerLedger
          entries={filteredEntries}
          accounts={metadata.accountOptions}
          categories={metadata.categoryOptions}
          orphanInfo={metadata.orphanEntryLookup}
          onCreate={manager.createEntry}
          onUpdate={manager.updateEntry}
          onDelete={manager.deleteEntry}
          isSaving={manager.isSaving}
        />
      ) : null}
    </section>
  );
}
