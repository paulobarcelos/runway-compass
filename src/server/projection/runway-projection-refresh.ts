// ABOUTME: Rebuilds the runway_projection sheet by aggregating budgets, flows, and snapshots.
// ABOUTME: Provides dependency hooks so routes can supply repositories and clients.
import {
  buildRunwayProjection,
  type CashFlowEntry as ProjectionCashFlowEntry,
  type MonthlyBudgetAllocation,
} from "./runway-projection";

import type { BudgetPlanRecord } from "@/server/google/repository/budget-plan-repository";
import type { CashFlowEntry } from "@/server/google/repository/cash-flow-repository";
import type { AccountsDiagnostics } from "@/server/google/repository/accounts-repository";
import type { SnapshotRecord } from "@/server/google/repository/snapshots-repository";
import type { RunwayProjectionRecord } from "@/server/google/repository/runway-projection-repository";

const WARNING_BALANCE_THRESHOLD = 5000;
const DANGER_BALANCE_THRESHOLD = 2000;

interface SpreadsheetScopedOptions {
  spreadsheetId: string;
}

type LoadBudgets = (options: SpreadsheetScopedOptions) => Promise<BudgetPlanRecord[]>;
type LoadCashFlows = (options: SpreadsheetScopedOptions) => Promise<CashFlowEntry[]>;
type LoadSnapshots = (options: SpreadsheetScopedOptions) => Promise<SnapshotRecord[]>;
type LoadAccounts = (options: SpreadsheetScopedOptions) => Promise<AccountsDiagnostics>;

type SaveProjection = (options: {
  spreadsheetId: string;
  rows: RunwayProjectionRecord[];
}) => Promise<void>;

export interface RunwayProjectionRefreshResult {
  updatedAt: string;
  rowsWritten: number;
}

export interface RunwayProjectionRefresherDependencies {
  loadBudgets?: LoadBudgets;
  loadCashFlows?: LoadCashFlows;
  loadSnapshots?: LoadSnapshots;
  loadAccounts?: LoadAccounts;
  saveProjection?: SaveProjection;
  now?: () => Date;
}

function aggregateBudgets(records: BudgetPlanRecord[]): MonthlyBudgetAllocation[] {
  const totals = new Map<string, { month: number; year: number; amount: number }>();

  for (const record of records) {
    const key = `${record.year}-${record.month}`;
    const existing = totals.get(key);

    if (existing) {
      existing.amount += record.amount;
    } else {
      totals.set(key, {
        month: record.month,
        year: record.year,
        amount: record.amount,
      });
    }
  }

  return Array.from(totals.values()).sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }

    return left.month - right.month;
  });
}

function mapCashFlows(entries: CashFlowEntry[]): ProjectionCashFlowEntry[] {
  return entries.map((entry) => ({
    flowId: entry.flowId,
    status: entry.status,
    date: entry.date,
    amount: entry.amount,
    accountId: entry.accountId,
    categoryId: entry.categoryId,
    note: entry.note,
  }));
}

function filterRunwaySnapshots(
  snapshots: SnapshotRecord[],
  accounts: AccountsDiagnostics,
): SnapshotRecord[] {
  const runwayAccountIds = new Set(
    accounts.accounts
      .filter((account) => account.includeInRunway)
      .map((account) => account.accountId),
  );

  if (runwayAccountIds.size === 0) {
    return [];
  }

  return snapshots.filter((snapshot) => runwayAccountIds.has(snapshot.accountId));
}

export function createRunwayProjectionRefresher({
  loadBudgets,
  loadCashFlows,
  loadSnapshots,
  loadAccounts,
  saveProjection,
  now = () => new Date(),
}: RunwayProjectionRefresherDependencies = {}) {
  if (!loadBudgets || !loadCashFlows || !loadSnapshots || !loadAccounts || !saveProjection) {
    throw new Error("Missing runway projection refresh dependencies");
  }

  return async function refreshRunwayProjection({
    spreadsheetId,
  }: SpreadsheetScopedOptions): Promise<RunwayProjectionRefreshResult> {
    const [budgetRecords, cashFlowRecords, snapshotRecords, accountsDiagnostics] =
      await Promise.all([
        loadBudgets({ spreadsheetId }),
        loadCashFlows({ spreadsheetId }),
        loadSnapshots({ spreadsheetId }),
        loadAccounts({ spreadsheetId }),
      ]);

    const runwaySnapshots = filterRunwaySnapshots(snapshotRecords, accountsDiagnostics);

    const projectionRows = buildRunwayProjection({
      budgets: aggregateBudgets(budgetRecords),
      cashFlows: mapCashFlows(cashFlowRecords),
      snapshots: runwaySnapshots.map((snapshot) => ({
        accountId: snapshot.accountId,
        date: snapshot.date,
        balance: snapshot.balance,
      })),
      warningBalanceThreshold: WARNING_BALANCE_THRESHOLD,
      dangerBalanceThreshold: DANGER_BALANCE_THRESHOLD,
    });

    const runwayProjectionRows: RunwayProjectionRecord[] = projectionRows.map((row) => ({
      month: row.month,
      year: row.year,
      startingBalance: row.startingBalance,
      incomeTotal: row.projectedIncomeTotal,
      expenseTotal: row.projectedExpenseTotal,
      endingBalance: row.projectedEndingBalance,
      stoplightStatus: row.stoplightStatus,
      notes: row.notes,
    }));

    await saveProjection({ spreadsheetId, rows: runwayProjectionRows });

    const timestamp = now().toISOString();

    return {
      updatedAt: timestamp,
      rowsWritten: runwayProjectionRows.length,
    };
  };
}
