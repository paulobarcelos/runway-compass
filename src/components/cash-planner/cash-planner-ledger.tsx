// ABOUTME: Presents the cash planner ledger grouped by status with inline actions.
// ABOUTME: Surfaces planned, posted, and void entries plus save controls.
"use client";

import { useMemo } from "react";

import type { CashPlannerManagerState } from "./use-cash-planner-manager";

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

function formatDate(value: string) {
  if (!value || !value.trim()) {
    return "—";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function FlowActions({
  manager,
  flow,
}: {
  manager: CashPlannerManagerState;
  flow: CashPlannerManagerState["flows"][number];
}) {
  const handleDuplicate = () => {
    manager.duplicateFlow(flow.flowId);
  };

  const handleMarkPosted = () => {
    manager.updateFlow(flow.flowId, {
      status: "posted",
      actualAmount: flow.plannedAmount,
      actualDate: flow.plannedDate,
    });
  };

  const handleVoid = () => {
    manager.updateFlow(flow.flowId, {
      status: "void",
      actualAmount: 0,
      actualDate: "",
    });
  };

  const handleRemove = () => {
    manager.removeFlow(flow.flowId);
  };

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <button
        type="button"
        data-flow={flow.flowId}
        data-action="duplicate"
        onClick={handleDuplicate}
        className="rounded border border-zinc-300/70 px-2 py-1 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700/60 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
      >
        Duplicate
      </button>
      <button
        type="button"
        data-flow={flow.flowId}
        data-action="mark-posted"
        onClick={handleMarkPosted}
        className="rounded border border-emerald-500/70 bg-emerald-500/10 px-2 py-1 text-emerald-600 transition hover:bg-emerald-500/20 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300"
      >
        Mark posted
      </button>
      <button
        type="button"
        data-flow={flow.flowId}
        data-action="void"
        onClick={handleVoid}
        className="rounded border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-amber-600 transition hover:bg-amber-500/20 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300"
      >
        Void
      </button>
      <button
        type="button"
        data-flow={flow.flowId}
        data-action="remove"
        onClick={handleRemove}
        className="rounded border border-rose-400/60 bg-rose-500/10 px-2 py-1 text-rose-600 transition hover:bg-rose-500/20 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-200"
      >
        Remove
      </button>
    </div>
  );
}

function Section({
  title,
  emptyMessage,
  children,
}: {
  title: string;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-200/70 bg-white/70 p-4 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-100">{title}</h3>
      </header>
      <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-300">
        {children}
      </div>
      <footer className="text-xs text-zinc-400 dark:text-zinc-500">{emptyMessage}</footer>
    </section>
  );
}

export function CashPlannerLedger({ manager }: { manager: CashPlannerManagerState }) {
  const plannedFlows = useMemo(
    () => manager.flows.filter((flow) => flow.status === "planned"),
    [manager.flows],
  );
  const postedFlows = useMemo(
    () => manager.flows.filter((flow) => flow.status === "posted"),
    [manager.flows],
  );
  const voidFlows = useMemo(
    () => manager.flows.filter((flow) => flow.status === "void"),
    [manager.flows],
  );

  const totals = useMemo(
    () => ({
      planned: plannedFlows.reduce((sum, flow) => sum + flow.plannedAmount, 0),
      posted: postedFlows.reduce((sum, flow) => sum + flow.actualAmount, 0),
      voided: voidFlows.reduce((sum, flow) => sum + flow.plannedAmount, 0),
    }),
    [plannedFlows, postedFlows, voidFlows],
  );

  if (manager.status === "loading") {
    return (
      <section className="rounded-xl border border-zinc-200/70 bg-white/70 p-6 text-sm text-zinc-600 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
        Loading cash planner…
      </section>
    );
  }

  if (manager.status === "blocked") {
    return (
      <section className="rounded-xl border border-amber-300/60 bg-amber-50/80 p-6 text-sm text-amber-900 shadow-sm dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-100">
        {manager.blockingMessage ?? "Connect a spreadsheet to manage cash flows."}
      </section>
    );
  }

  if (manager.status === "error") {
    return (
      <section className="rounded-xl border border-rose-400/70 bg-rose-50/80 p-6 text-sm text-rose-900 shadow-sm dark:border-rose-500/40 dark:bg-rose-900/20 dark:text-rose-100">
        {manager.error ?? "Cash planner is temporarily unavailable. Try again shortly."}
      </section>
    );
  }

  const handleSave = () => {
    void manager.save();
  };

  const handleReload = () => {
    void manager.reload();
  };

  const showEmpty = manager.flows.length === 0;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Cash planner</h2>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            <span className="mr-3">Projected total: {formatCurrency(totals.planned)}</span>
            <span className="mr-3">Posted total: {formatCurrency(totals.posted)}</span>
            <span>Voided total: {formatCurrency(totals.voided)}</span>
          </div>
          {manager.lastSavedAt ? (
            <div className="text-xs text-zinc-400 dark:text-zinc-500">
              Last saved {formatDate(manager.lastSavedAt)}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            data-action="reload"
            onClick={handleReload}
            className="rounded border border-zinc-300/70 px-3 py-1 transition hover:border-zinc-400 dark:border-zinc-700/60 dark:hover:border-zinc-500"
          >
            Reload
          </button>
          <button
            type="button"
            data-action="save"
            disabled={!manager.isDirty || manager.isSaving}
            onClick={handleSave}
            className="rounded border border-emerald-500/70 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-600 transition disabled:cursor-not-allowed disabled:border-emerald-200/60 disabled:bg-emerald-100/30 disabled:text-emerald-300 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200 dark:disabled:border-emerald-400/20 dark:disabled:bg-emerald-400/5 dark:disabled:text-emerald-400"
          >
            {manager.isSaving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </header>

      {showEmpty ? (
        <div className="rounded-lg border border-dashed border-zinc-300/70 bg-zinc-50/70 p-6 text-sm text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-400">
          No cash flows captured yet. Add planned income and expenses to start projecting your runway.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Planned" emptyMessage="Duplicate or post entries after they clear.">
          {plannedFlows.length ? (
            <ul className="flex flex-col gap-3">
              {plannedFlows.map((flow) => (
                <li
                  key={flow.flowId}
                  className="rounded-lg border border-zinc-200/70 bg-white/80 p-3 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70"
                >
                  <div className="flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-200">
                    <div className="flex flex-col">
                      <span className="font-semibold">{flow.note || flow.type}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Planned {formatDate(flow.plannedDate)}
                      </span>
                    </div>
                    <span className="font-semibold">{formatCurrency(flow.plannedAmount)}</span>
                  </div>
                  <FlowActions manager={manager} flow={flow} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No planned entries.</p>
          )}
        </Section>

        <Section title="Posted" emptyMessage="Posted entries include actual cash movement.">
          {postedFlows.length ? (
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <th className="px-2 py-1">Label</th>
                  <th className="px-2 py-1">Actual date</th>
                  <th className="px-2 py-1 text-right">Actual amount</th>
                </tr>
              </thead>
              <tbody>
                {postedFlows.map((flow) => (
                  <tr
                    key={flow.flowId}
                    className="rounded-lg border border-transparent bg-white/80 text-sm shadow-sm dark:bg-zinc-900/70"
                  >
                    <td className="px-2 py-2 text-zinc-700 dark:text-zinc-200">{flow.note || flow.type}</td>
                    <td className="px-2 py-2 text-zinc-500 dark:text-zinc-400">{formatDate(flow.actualDate)}</td>
                    <td className="px-2 py-2 text-right font-semibold text-zinc-700 dark:text-zinc-100">
                      {formatCurrency(flow.actualAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No posted entries.</p>
          )}
        </Section>
      </div>

      {voidFlows.length ? (
        <Section title="Voided" emptyMessage="Voided entries stay listed for reference.">
          <ul className="flex flex-col gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            {voidFlows.map((flow) => (
              <li key={flow.flowId} className="flex items-center justify-between">
                <span>{flow.note || flow.type}</span>
                <span>{formatCurrency(flow.plannedAmount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </section>
  );
}
