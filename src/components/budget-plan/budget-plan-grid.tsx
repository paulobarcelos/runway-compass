// ABOUTME: Presents the editable budget plan grid with helper controls.
// ABOUTME: Renders money inputs, horizon controls, bulk helpers, totals, and save status.
"use client";

import { useEffect, useMemo, useState } from "react";

import { MoneyInput, type MoneyInputChange } from "@/components/money-input";

import type {
  BudgetPlanManagerCell,
  BudgetPlanManagerRow,
  BudgetPlanManagerState,
} from "./use-budget-plan-manager";

const MAX_HORIZON_MONTHS = 120;

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

function currentMonthInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthInputFromIso(value: string | null | undefined) {
  if (!value) {
    return currentMonthInput();
  }

  const match = value.match(/^(\d{4})-(\d{2})/);

  if (!match) {
    return currentMonthInput();
  }

  return `${match[1]}-${match[2]}`;
}

function isoFromMonthInput(value: string | null | undefined) {
  if (!value || !/^(\d{4})-(\d{2})$/.test(value)) {
    return `${currentMonthInput()}-01`;
  }

  return `${value}-01`;
}

function clampMonths(value: number) {
  if (!Number.isFinite(value)) {
    return 12;
  }

  return Math.max(1, Math.min(MAX_HORIZON_MONTHS, value));
}

function toneTextClass(tone: "positive" | "negative" | "neutral") {
  if (tone === "positive") {
    return "text-emerald-600 dark:text-emerald-400";
  }

  if (tone === "negative") {
    return "text-rose-600 dark:text-rose-400";
  }

  return "text-zinc-900 dark:text-zinc-100";
}

function inputToneClass(tone: "positive" | "negative" | "neutral") {
  if (tone === "positive") {
    return "!text-emerald-600 dark:!text-emerald-400";
  }

  if (tone === "negative") {
    return "!text-rose-600 dark:!text-rose-400";
  }

  return "!text-zinc-900 dark:!text-zinc-100";
}

function tonePreviewClass(tone: "positive" | "negative" | "neutral") {
  if (tone === "positive") {
    return "!text-emerald-600 dark:!text-emerald-300";
  }

  if (tone === "negative") {
    return "!text-rose-600 dark:!text-rose-300";
  }

  return "!text-zinc-500 dark:!text-zinc-400";
}

function resolveTone(amount: number): "positive" | "negative" | "neutral" {
  if (amount > 0) {
    return "positive";
  }

  if (amount < 0) {
    return "negative";
  }

  return "neutral";
}

function AmountCell({
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
  const tone = resolveTone(cell.amount);

  const toneFocusClass =
    tone === "positive"
      ? "focus-within:ring-emerald-200"
      : tone === "negative"
        ? "focus-within:ring-rose-200"
        : "";

  const handleMoneyChange = (change: MoneyInputChange) => {
    const nextAmount =
      typeof change.amount === "number" && Number.isFinite(change.amount)
        ? change.amount
        : 0;

    manager.setCellValue(row.category.categoryId, cell.monthIndex, {
      amount: nextAmount,
      currency: change.currency,
    });
  };

  const handleCopyPrevious = () => {
    manager.copyPreviousMonth(row.category.categoryId, cell.monthIndex);
  };

  const handleFillRemaining = () => {
    manager.fillRemainingMonths(row.category.categoryId, cell.monthIndex);
  };

  const handleFillAll = () => {
    manager.fillAllMonths(row.category.categoryId, cell.monthIndex);
  };

  const handleSpreadEvenly = () => {
    manager.spreadEvenly(row.category.categoryId, cell.monthIndex);
  };

  return (
    <div
      className="flex flex-col gap-2"
      data-cell={`${row.category.categoryId}:${cell.monthIndex}`}
    >
      <MoneyInput
        className={`${toneFocusClass}`}
        value={cell.amount}
        currency={cell.currency}
        onChange={handleMoneyChange}
        allowCurrencyChange
        showBasePreview
        disabled={disabled}
        inputClassName={inputToneClass(tone)}
        basePreviewClassName={tonePreviewClass(tone)}
      />
      <div className="flex flex-wrap gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
        <button
          type="button"
          data-helper="copy-prev"
          onClick={handleCopyPrevious}
          disabled={disabled || cell.monthIndex === 0}
          className="rounded border border-zinc-300/70 px-2 py-1 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600/60 dark:hover:bg-zinc-800"
        >
          Copy Prev
        </button>
        <button
          type="button"
          data-helper="fill-remaining"
          onClick={handleFillRemaining}
          disabled={
            disabled ||
            cell.monthIndex === row.cells.length - 1
          }
          className="rounded border border-zinc-300/70 px-2 py-1 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600/60 dark:hover:bg-zinc-800"
        >
          Fill Remaining
        </button>
        <button
          type="button"
          data-helper="fill-all"
          onClick={handleFillAll}
          disabled={disabled}
          className="rounded border border-zinc-300/70 px-2 py-1 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600/60 dark:hover:bg-zinc-800"
        >
          Fill Row
        </button>
        <button
          type="button"
          data-helper="spread"
          onClick={handleSpreadEvenly}
          disabled={disabled}
          className="rounded border border-zinc-300/70 px-2 py-1 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600/60 dark:hover:bg-zinc-800"
        >
          Spread Evenly
        </button>
      </div>
      {row.category.rolloverFlag && cell.rolloverBalance > 0 ? (
        <span className="text-xs accent-text dark:accent-text">
          {`Rollover: ${formatRollover(cell.rolloverBalance)}`}
        </span>
      ) : null}
    </div>
  );
}

export function BudgetPlanGrid({ manager }: { manager: BudgetPlanManagerState }) {
  const [startMonth, setStartMonth] = useState(() =>
    monthInputFromIso(manager.metadata?.start),
  );
  const [monthsInput, setMonthsInput] = useState(() =>
    String(manager.metadata?.months ?? 12),
  );

  useEffect(() => {
    if (!manager.metadata) {
      return;
    }

    setStartMonth(monthInputFromIso(manager.metadata.start));
    setMonthsInput(String(manager.metadata.months));
  }, [manager.metadata]);

  const disabledCells =
    manager.isSaving ||
    manager.status !== "ready" ||
    !!manager.blockingMessage ||
    manager.isHorizonUpdating;

  const headerLabels = useMemo(
    () => manager.months.map((month) => monthLabel(month)),
    [manager.months],
  );

  const normalizedStartIso = isoFromMonthInput(startMonth);
  const parsedMonths = Number.parseInt(monthsInput, 10);
  const sanitizedMonths = clampMonths(parsedMonths);
  const hasHorizonChange =
    !manager.metadata ||
    manager.metadata.start !== normalizedStartIso ||
    manager.metadata.months !== sanitizedMonths;

  const handleApplyHorizon = () => {
    if (!hasHorizonChange) {
      return;
    }

    const nextMetadata = {
      start: normalizedStartIso,
      months: sanitizedMonths,
    };

    let action: "expand" | "shrink" | "apply" = "apply";

    if (manager.metadata) {
      if (sanitizedMonths > manager.metadata.months) {
        action = "expand";
      } else if (sanitizedMonths < manager.metadata.months) {
        action = "shrink";
      } else if (manager.metadata.start !== normalizedStartIso) {
        action = "apply";
      }
    }

    if (action === "shrink") {
      const confirmed = window.confirm(
        "Shrinking the horizon will permanently remove budgets beyond the new end month. Continue?",
      );

      if (!confirmed) {
        return;
      }
    }

    void manager.updateHorizon(nextMetadata, action);
  };

  const applyDisabled =
    manager.isHorizonUpdating || manager.status === "loading" || !hasHorizonChange;

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
    <section className="flex flex-col gap-5 rounded-xl border border-zinc-200/70 bg-white/60 p-6 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="rounded-lg border border-zinc-200/70 bg-white/80 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Start month
            <input
              type="month"
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value)}
              disabled={manager.isHorizonUpdating}
              className="rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Duration (months)
            <input
              type="number"
              min={1}
              max={MAX_HORIZON_MONTHS}
              value={monthsInput}
              onChange={(event) => setMonthsInput(event.target.value)}
              disabled={manager.isHorizonUpdating}
              className="w-28 rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplyHorizon}
              disabled={applyDisabled}
              className="inline-flex items-center rounded-md accent-bg px-4 py-2 text-xs font-semibold shadow-sm transition hover:accent-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {manager.isHorizonUpdating ? "Updating…" : "Apply horizon"}
            </button>
          </div>
        </div>
        {manager.horizonError ? (
          <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
            {manager.horizonError}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th
                data-column="category"
                className="sticky left-0 z-20 px-2 py-1 bg-white/95 shadow-[4px_0_6px_rgba(24,24,27,0.05)] dark:bg-zinc-900/95 dark:shadow-[4px_0_6px_rgba(12,12,12,0.35)]"
              >
                Category
              </th>
              {headerLabels.map((label, index) => (
                <th key={manager.months[index]?.id ?? index} className="px-2 py-1">
                  {label}
                </th>
              ))}
              <th
                data-column="total"
                className="sticky right-0 z-20 px-2 py-1 text-right bg-white/95 shadow-[-4px_0_6px_rgba(24,24,27,0.05)] dark:bg-zinc-900/95 dark:shadow-[-4px_0_6px_rgba(12,12,12,0.35)]"
              >
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {manager.rows.map((row) => (
              <tr
                key={row.category.categoryId}
                className="rounded-lg border border-transparent bg-white/60 text-sm shadow-sm dark:bg-zinc-900/60"
              >
                <th
                  data-column="category"
                  className="sticky left-0 z-10 rounded-l-lg px-3 py-2 align-top text-left text-sm font-semibold text-zinc-700 bg-white/95 shadow-[4px_0_6px_rgba(24,24,27,0.05)] dark:bg-zinc-900/95 dark:text-zinc-100 dark:shadow-[4px_0_6px_rgba(12,12,12,0.35)]"
                >
                  <span>{row.category.label}</span>
                </th>
                {row.cells.map((cell) => (
                  <td key={cell.recordId} className="px-2 py-2 align-top">
                    <AmountCell
                      manager={manager}
                      row={row}
                      cell={cell}
                      disabled={disabledCells}
                    />
                  </td>
                ))}
                <td
                  data-column="total"
                  className={`sticky right-0 z-10 px-3 py-2 align-top text-right text-sm font-semibold bg-white/95 shadow-[-4px_0_6px_rgba(24,24,27,0.05)] dark:bg-zinc-900/95 dark:shadow-[-4px_0_6px_rgba(12,12,12,0.35)] ${toneTextClass(row.totalTone)}`}
                >
                  {row.totalBaseDisplay}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              <td
                className="sticky left-0 z-10 px-3 py-2 text-right bg-white/95 shadow-[4px_0_6px_rgba(24,24,27,0.05)] dark:bg-zinc-900/95"
                colSpan={manager.months.length + 1}
              >
                Grand total
              </td>
              <td
                data-column="total"
                className={`sticky right-0 z-10 px-3 py-2 text-right bg-white/95 shadow-[-4px_0_6px_rgba(24,24,27,0.05)] dark:bg-zinc-900/95 ${toneTextClass(manager.grandTotalTone)}`}
              >
                {manager.grandTotalBaseDisplay}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-wrap items-center gap-2">
          {manager.lastSavedAt ? (
            <span>Saved {new Date(manager.lastSavedAt).toLocaleTimeString()}</span>
          ) : null}
          {manager.isSaving ? <span>Saving…</span> : null}
          {manager.saveError ? (
            <span className="text-rose-600 dark:text-rose-400">{manager.saveError}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-action="reset"
            onClick={manager.reset}
            disabled={!manager.isDirty || disabledCells}
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
            className="inline-flex items-center rounded-md accent-bg px-4 py-2 text-xs font-semibold shadow-sm transition hover:accent-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
              {manager.isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}
