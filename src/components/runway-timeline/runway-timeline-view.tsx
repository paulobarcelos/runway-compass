// ABOUTME: Presents the runway timeline state as a table and status cards.
// ABOUTME: Handles loading, blocked, error, and ready rendering branches.
"use client";

import { useMemo, type ReactNode } from "react";

import type { RunwayTimelineState, RunwayTimelineRow } from "./use-runway-timeline";

const STOPLIGHT_STYLES: Record<string, { label: string; badge: string; dot: string }> = {
  green: {
    label: "Green",
    badge:
      "inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-800/70",
    dot: "h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-600/30",
  },
  yellow: {
    label: "Yellow",
    badge:
      "inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800/70",
    dot: "h-2 w-2 rounded-full bg-amber-500 shadow-sm shadow-amber-600/30",
  },
  red: {
    label: "Red",
    badge:
      "inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-800/70",
    dot: "h-2 w-2 rounded-full bg-rose-500 shadow-sm shadow-rose-600/30",
  },
  neutral: {
    label: "Pending",
    badge:
      "inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-200 dark:ring-zinc-700/70",
    dot: "h-2 w-2 rounded-full bg-zinc-400 shadow-sm shadow-zinc-500/30",
  },
};

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

interface StoplightBadgeProps {
  status: string;
}

function StoplightBadge({ status }: StoplightBadgeProps) {
  const normalized = status.toLowerCase();
  const styles = STOPLIGHT_STYLES[normalized] || STOPLIGHT_STYLES.neutral;

  return (
    <span className={styles.badge}>
      <span className={styles.dot} aria-hidden="true" />
      <span>{styles.label}</span>
    </span>
  );
}

interface TimelineTableProps {
  rows: RunwayTimelineRow[];
}

function TimelineTable({ rows }: TimelineTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200/70 bg-white/60 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-700">
        <thead className="bg-zinc-50/80 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/70 dark:text-zinc-400">
          <tr>
            <th scope="col" className="px-4 py-3">Month</th>
            <th scope="col" className="px-4 py-3">Starting balance</th>
            <th scope="col" className="px-4 py-3">Income</th>
            <th scope="col" className="px-4 py-3">Expenses</th>
            <th scope="col" className="px-4 py-3">Net change</th>
            <th scope="col" className="px-4 py-3">Ending balance</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-700/80">
          {rows.map((row) => {
            const endingClass =
              row.endingBalanceValue < 0
                ? "text-rose-600 dark:text-rose-300"
                : "text-emerald-600 dark:text-emerald-300";

            return (
              <tr key={row.id} className="bg-white/70 dark:bg-transparent">
                <th
                  scope="row"
                  className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100"
                >
                  {row.monthLabel}
                </th>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {row.startingBalanceDisplay}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-emerald-600 dark:text-emerald-300">
                  {row.incomeDisplay}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-rose-600 dark:text-rose-300">
                  {row.expenseDisplay}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-zinc-700 dark:text-zinc-200">
                  {row.netChangeDisplay}
                </td>
                <td className={`whitespace-nowrap px-4 py-3 font-semibold ${endingClass}`}>
                  {row.endingBalanceDisplay}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StoplightBadge status={row.stoplightStatus} />
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                  {row.notes || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RunwayTimelineView({ timeline }: { timeline: RunwayTimelineState }) {
  const statusLabel = useMemo(() => {
    switch (timeline.status) {
      case "loading":
        return "Loading runway timeline…";
      case "blocked":
        return "Runway timeline unavailable";
      case "error":
        return "Runway timeline error";
      default:
        return "Runway timeline";
    }
  }, [timeline.status]);

  const updatedAtLabel = useMemo(
    () => formatUpdatedAt(timeline.lastUpdatedAt),
    [timeline.lastUpdatedAt],
  );

  const refreshDisabled = timeline.status === "loading" || timeline.status === "blocked";

  let body: ReactNode = null;

  if (timeline.status === "loading") {
    body = (
      <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
        Loading runway timeline…
      </div>
    );
  } else if (timeline.status === "blocked" && timeline.blockingMessage) {
    body = (
      <div className="rounded-xl border border-dashed border-amber-300/70 bg-amber-50/70 p-6 text-sm text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-100">
        {timeline.blockingMessage}
      </div>
    );
  } else if (timeline.status === "error") {
    body = (
      <div className="rounded-xl border border-rose-200/70 bg-rose-50/60 p-6 text-sm text-rose-900 shadow-sm shadow-rose-900/5 dark:border-rose-800/70 dark:bg-rose-900/20 dark:text-rose-100">
        {timeline.error ?? "Runway timeline failed to load."}
      </div>
    );
  } else if (timeline.rows.length === 0) {
    body = (
      <div className="rounded-xl border border-zinc-200/70 bg-white/60 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
        No runway projection rows yet. Add budget, cash flow, and snapshot data to populate the
        timeline.
      </div>
    );
  } else {
    body = <TimelineTable rows={timeline.rows} />;
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{statusLabel}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Visualize month-by-month runway by combining starting balances, planned income, and
            spending.
          </p>
          {updatedAtLabel ? (
            <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Updated {updatedAtLabel}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            void timeline.refresh();
          }}
          disabled={refreshDisabled}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-200/70 bg-white/70 px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm shadow-zinc-900/5 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
        >
          Refresh
        </button>
      </header>
      {body}
    </section>
  );
}
