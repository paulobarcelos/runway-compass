// ABOUTME: Presents the editable budget plan grid with helper controls.
// ABOUTME: Renders monthly inputs, conversions, and rollover indicators.
"use client";

import { useMemo } from "react";
import type { ChangeEvent } from "react";

import type {
  BudgetPlanManagerCell,
  BudgetPlanManagerRow,
  BudgetPlanManagerState,
} from "./use-budget-plan-manager";

function monthLabel(month: { month: number; year: number }) {
  const date = new Date(month.year, month.month - 1, 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatRollover(amount: number) {
  return amount.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function AmountInput({
  manager,
  row,
  cell,
  disabled,
}: {
  manager: BudgetPlanManagerState;
  row: BudgetPlanManagerRow;
  cell: BudgetPlanManagerCell;
  disabled: boolean;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const numeric =
      raw.trim() === "" ? 0 : Number.parseFloat(raw.replace(/,/g, ""));

    if (!Number.isFinite(numeric)) {
      return;
    }

    manager.setAmount(row.category.categoryId, cell.monthIndex, numeric);
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        data-cell={`${row.category.categoryId}:${cell.monthIndex}`}
        type="number"
        inputMode="decimal"
        disabled={disabled}
        value={Number.isFinite(cell.amount) ? cell.amount : 0}
        onChange={handleChange}
        className="w-full rounded-md border border-zinc-300/70 px-2 py-1 text-sm shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {cell.baseCurrencyDisplay ? (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {cell.baseCurrencyDisplay}
        </span>
      ) : null}
      {row.category.rolloverFlag && cell.rolloverBalance > 0 ? (
        <span className="text-xs text-emerald-600 dark:text-emerald-300">
          {`Rollover: ${formatRollover(cell.rolloverBalance)}`}
        </span>
      ) : null}
    </div>
  );
}

export function BudgetPlanGrid({ manager }: { manager: BudgetPlanManagerState }) {
  const disabled = manager.isSaving || manager.status !== "ready" || !!manager.blockingMessage;

  const headerLabels = useMemo(
    () => manager.months.map((month) => monthLabel(month)),
    [manager.months],
  );

  if (manager.status === "loading") {
    return (
      <section className="rounded-xl border border-zinc-200/70 bg-white/60 p-6 text-sm text-zinc-600 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
        Loading budget plan…
      </section>
    );
  }

  if (manager.blockingMessage) {
    return (
      <section className="rounded-xl border border-amber-300/70 bg-amber-50/90 p-6 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-100">
        {manager.blockingMessage}
      </section>
    );
  }

  if (manager.status === "error") {
    return (
      <section className="rounded-xl border border-rose-300/70 bg-rose-50/90 p-6 text-sm text-rose-900 dark:border-rose-700/60 dark:bg-rose-900/20 dark:text-rose-100">
        {manager.error ?? "Budget plan is temporarily unavailable. Try reloading."}
      </section>
    );
  }

  if (!manager.rows.length) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300/70 bg-zinc-50/60 p-6 text-sm text-zinc-600 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-300">
        Connect a spreadsheet to start planning your budgets.
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200/70 bg-white/60 p-6 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="px-2 py-1">Category</th>
              {headerLabels.map((label, index) => (
                <th key={manager.months[index]?.id ?? index} className="px-2 py-1">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {manager.rows.map((row) => (
              <tr
                key={row.category.categoryId}
                className="rounded-lg border border-transparent bg-white/60 text-sm shadow-sm dark:bg-zinc-900/60"
              >
                <th className="rounded-l-lg px-3 py-2 align-top text-left text-sm font-semibold text-zinc-700 dark:text-zinc-100">
                  <div className="flex flex-col gap-1">
                    <span>{row.category.label}</span>
                    <span className="text-xs uppercase text-zinc-400 dark:text-zinc-500">
                      {row.category.currencyCode}
                    </span>
                  </div>
                </th>
                {row.cells.map((cell, index) => (
                  <td key={cell.recordId ?? `${row.category.categoryId}:${index}`} className="px-2 py-2 align-top">
                    <AmountInput
                      manager={manager}
                      row={row}
                      cell={cell}
                      disabled={disabled}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          {manager.lastSavedAt ? (
            <span>
              Saved {new Date(manager.lastSavedAt).toLocaleTimeString()}
            </span>
          ) : null}
          {manager.isSaving ? <span>Saving…</span> : null}
          {manager.saveError ? (
            <span className="text-rose-600 dark:text-rose-400">{manager.saveError}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-action="reset"
            onClick={manager.reset}
            disabled={!manager.isDirty || disabled}
            className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Reset changes
          </button>
          <button
            type="button"
            data-action="save"
            onClick={() => {
              void manager.save();
            }}
            disabled={!manager.isDirty || manager.isSaving || manager.status !== "ready"}
            className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {manager.isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}
