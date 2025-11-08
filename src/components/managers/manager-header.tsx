// ABOUTME: Shared header for manager routes providing status, sheet link, and sync summary.
"use client";

import type { MouseEvent, ReactNode } from "react";

const STATUS_TONE_CLASSES: Record<ManagerHeaderStatusTone, string> = {
  default:
    "inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-200 dark:ring-zinc-700/70",
  info:
    "inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-800/70",
  success:
    "inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:ring-emerald-800/70",
  warning:
    "inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800/70",
  danger:
    "inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-800/70",
};

const SYNC_DOT_CLASSES = {
  offline: "bg-rose-500 shadow-rose-600/30",
  pending: "bg-amber-500 shadow-amber-600/30",
  ready: "bg-emerald-500 shadow-emerald-600/30",
};

const SHEET_LINK_BASE_CLASSES =
  "inline-flex flex-col gap-0.5 rounded-xl border border-zinc-200/70 bg-white/70 px-4 py-2 text-sm text-zinc-700 shadow-sm shadow-zinc-900/5 transition hover:border-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-zinc-700/70 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:border-zinc-600";

const SHEET_LINK_DISABLED_CLASSES =
  "cursor-not-allowed opacity-60 hover:border-zinc-200 focus-visible:ring-0";

export type ManagerHeaderStatusTone = "default" | "info" | "success" | "warning" | "danger";

export interface ManagerHeaderProps {
  title: string;
  description?: string;
  status: {
    label: string;
    tone?: ManagerHeaderStatusTone;
  };
  sheetLink: {
    href: string;
    label: string;
    disabled?: boolean;
    sheetName?: string;
  };
  sync: {
    label: string;
    detail?: string;
    isPending?: boolean;
    isOffline?: boolean;
  };
  actions?: ReactNode;
}

export function ManagerHeader({
  title,
  description,
  status,
  sheetLink,
  sync,
  actions,
}: ManagerHeaderProps) {
  const statusTone = status.tone ?? "default";
  const syncMode = sync.isOffline ? "offline" : sync.isPending ? "pending" : "ready";
  const sheetLinkClasses = [
    SHEET_LINK_BASE_CLASSES,
    sheetLink.disabled ? SHEET_LINK_DISABLED_CLASSES : "",
  ]
    .filter(Boolean)
    .join(" ");

  const sheetLinkProps = sheetLink.disabled
    ? {
        tabIndex: -1,
        "aria-disabled": true,
        onClick: (event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
        },
      }
    : {};

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
            <span
              data-testid="manager-header-status"
              className={STATUS_TONE_CLASSES[statusTone]}
            >
              {status.label}
            </span>
          </div>
          {description ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      <div className="rounded-2xl border border-dashed border-zinc-200/80 bg-zinc-50/70 p-4 text-sm text-zinc-700 shadow-inner shadow-white/40 dark:border-zinc-700/70 dark:bg-zinc-950/40 dark:text-zinc-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <a
            data-testid="manager-header-sheet-link"
            className={sheetLinkClasses}
            href={sheetLink.href}
            target="_blank"
            rel="noreferrer"
            {...sheetLinkProps}
          >
            <span className="font-medium text-zinc-900 dark:text-zinc-100">{sheetLink.label}</span>
            {sheetLink.sheetName ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{sheetLink.sheetName}</span>
            ) : null}
          </a>
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full shadow-sm ${SYNC_DOT_CLASSES[syncMode]}`}
              />
              <span>{sync.label}</span>
            </div>
            {sync.detail ? (
              <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {sync.detail}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
