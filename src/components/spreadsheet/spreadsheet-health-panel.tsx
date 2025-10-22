// ABOUTME: Displays spreadsheet diagnostics sourced from the health provider.
// ABOUTME: Summarizes sheet issues and offers refresh actions for fixes.
"use client";

import { useMemo } from "react";

import { useSpreadsheetHealth } from "./spreadsheet-health-context";
import type { SpreadsheetIssue } from "./spreadsheet-health-helpers";

interface IssueGroup {
  sheetId: string;
  sheetTitle: string;
  warnings: SpreadsheetIssue[];
  errors: SpreadsheetIssue[];
}

function groupIssues(issues: SpreadsheetIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();

  for (const issue of issues) {
    const existing = groups.get(issue.sheetId) ?? {
      sheetId: issue.sheetId,
      sheetTitle: issue.sheetTitle,
      warnings: [],
      errors: [],
    };

    if (issue.severity === "error") {
      existing.errors.push(issue);
    } else {
      existing.warnings.push(issue);
    }

    groups.set(issue.sheetId, existing);
  }

  return Array.from(groups.values()).sort((left, right) => {
    if (left.errors.length !== right.errors.length) {
      return right.errors.length - left.errors.length;
    }

    if (left.warnings.length !== right.warnings.length) {
      return right.warnings.length - left.warnings.length;
    }

    return left.sheetTitle.localeCompare(right.sheetTitle);
  });
}

export function SpreadsheetHealthPanel() {
  const {
    spreadsheetId,
    status,
    issues,
    error,
    isFetching,
    reload,
  } = useSpreadsheetHealth();

  const grouped = useMemo(() => groupIssues(issues), [issues]);
  const hasErrors = grouped.some((group) => group.errors.length > 0);
  const hasWarnings = grouped.some((group) => group.warnings.length > 0);

  if (!spreadsheetId) {
    return null;
  }

  const tone = (() => {
    if (status === "error") {
      return "error";
    }

    if (hasErrors) {
      return "error";
    }

    if (hasWarnings) {
      return "warning";
    }

    if (status === "loading" || isFetching) {
      return "info";
    }

    return "success";
  })();

  const toneClasses: Record<string, string> = {
    error:
      "border-rose-200/70 bg-rose-50/80 text-rose-800 dark:border-rose-700/60 dark:bg-rose-900/40 dark:text-rose-100",
    warning:
      "border-amber-200/70 bg-amber-50/80 text-amber-800 dark:border-amber-500/60 dark:bg-amber-900/40 dark:text-amber-100",
    info:
      "border-sky-200/70 bg-sky-50/80 text-sky-800 dark:border-sky-600/60 dark:bg-sky-900/30 dark:text-sky-100",
    success:
      "border-emerald-200/70 bg-emerald-50/80 text-emerald-800 dark:border-emerald-600/60 dark:bg-emerald-900/40 dark:text-emerald-100",
  };

  return (
    <section
      className={`flex flex-col gap-4 rounded-2xl border p-6 shadow-sm shadow-zinc-900/5 ${toneClasses[tone]}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Spreadsheet health</h2>
          {hasErrors ? (
            <p className="mt-1 text-sm leading-5">
              Blocking issues prevent changes from syncing. Fix them in Google Sheets, then reload.
            </p>
          ) : hasWarnings ? (
            <p className="mt-1 text-sm leading-5">
              Some tabs need attention. Review the notes below to keep data flowing smoothly.
            </p>
          ) : tone === "info" ? (
            <p className="mt-1 text-sm leading-5">
              Checking your spreadsheet configuration. Hang tight while diagnostics load.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-5">
              Everything looks clear. We&apos;ll surface any sheet issues here, alongside future repair tools.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void reload()}
            disabled={isFetching || status === "loading"}
            className="inline-flex items-center rounded-md border border-current/40 bg-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-current shadow-sm transition hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFetching || status === "loading" ? "Refreshing…" : "Reload"}
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center rounded-md border border-dashed border-current/40 bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wide text-current/80 opacity-80"
          >
            Repair (soon)
          </button>
        </div>
      </div>

      {error && status === "error" ? (
        <p className="text-sm">
          {error}. Try reloading or reconnecting your sheet if the issue persists.
        </p>
      ) : null}

      {grouped.length > 0 ? (
        <div className="flex flex-col gap-3">
          {grouped.map((group) => (
            <article
              key={group.sheetId}
              className="rounded-xl border border-current/20 bg-white/70 p-4 text-sm text-zinc-900 shadow-sm shadow-zinc-900/5 dark:bg-zinc-950/60 dark:text-zinc-100"
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-100">
                    {group.sheetTitle}
                  </h3>
                  {group.errors.length > 0 ? (
                    <p className="text-xs text-rose-600 dark:text-rose-300">
                      Resolve these items before editing. Fields stay read-only until errors clear.
                    </p>
                  ) : group.warnings.length > 0 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-300">
                      These warnings won&apos;t block edits but could cause sync hiccups later.
                    </p>
                  ) : null}
                </div>
                {group.sheetId === "snapshots" ? (
                  <span className="text-xs font-medium text-rose-600 dark:text-rose-300">
                    Snapshot capture stays disabled until this tab is repaired.
                  </span>
                ) : null}
              </header>
              <ul className="mt-3 space-y-2">
                {group.errors.map((issue, index) => (
                  <li
                    key={`error-${issue.code ?? "issue"}-${issue.rowNumber ?? "global"}-${index}`}
                    className="rounded-md border border-rose-200/60 bg-rose-50/80 p-3 text-rose-800 shadow-sm dark:border-rose-700/60 dark:bg-rose-900/40 dark:text-rose-100"
                  >
                    <IssueLine issue={issue} />
                  </li>
                ))}
                {group.warnings.map((issue, index) => (
                  <li
                    key={`warning-${issue.code ?? "issue"}-${issue.rowNumber ?? "global"}-${index}`}
                    className="rounded-md border border-amber-200/60 bg-amber-50/70 p-3 text-amber-800 shadow-sm dark:border-amber-600/50 dark:bg-amber-900/30 dark:text-amber-100"
                  >
                    <IssueLine issue={issue} />
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : status === "loading" || isFetching ? (
        <p className="text-sm">Running health checks…</p>
      ) : null}
    </section>
  );
}

function IssueLine({ issue }: { issue: SpreadsheetIssue }) {
  return (
    <div className="flex flex-col gap-1 text-sm leading-5">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        {issue.code ? <span>{issue.code}</span> : null}
        {issue.rowNumber != null ? <span>Row {issue.rowNumber}</span> : <span>Sheet</span>}
      </div>
      <span>{issue.message}</span>
    </div>
  );
}
