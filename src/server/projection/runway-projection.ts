// ABOUTME: Builds runway projection rows from budgets, cash flows, and snapshots.
// ABOUTME: Aggregates monthly income/expense totals and stoplight classifications.
export type CashFlowType = "income" | "expense";
export type CashFlowStatus = "planned" | "posted" | "void";

export interface CashFlowEntry {
  flowId?: string;
  type: CashFlowType;
  status: CashFlowStatus;
  plannedDate: string;
  plannedAmount: number;
  actualDate?: string | null;
  actualAmount?: number | null;
}

export interface MonthlyBudgetAllocation {
  month: number;
  year: number;
  amount: number;
}

export interface AccountSnapshotBalance {
  accountId: string;
  date: string;
  balance: number;
}

export interface RunwayProjectionRow {
  month: number;
  year: number;
  startingBalance: number;
  actualIncomeTotal: number;
  projectedIncomeTotal: number;
  actualExpenseTotal: number;
  projectedExpenseTotal: number;
  actualEndingBalance: number;
  projectedEndingBalance: number;
  stoplightStatus: "green" | "yellow" | "red";
  notes: string;
}

export interface RunwayProjectionOptions {
  budgets: MonthlyBudgetAllocation[];
  cashFlows: CashFlowEntry[];
  snapshots: AccountSnapshotBalance[];
  warningBalanceThreshold: number;
  dangerBalanceThreshold: number;
  monthsToProject?: number;
}

interface ParsedMonth {
  month: number;
  year: number;
  monthKey: number;
  timestamp: number;
}

const ISO_MONTH_PATTERN = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

function ensureFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${context}: expected finite number`);
  }

  return value;
}

function ensureInteger(value: unknown, context: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid ${context}: expected integer`);
  }

  return value;
}

function createMonthKey(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function monthKeyToParts(monthKey: number): { month: number; year: number } {
  const year = Math.floor(monthKey / 12);
  const month = monthKey % 12;

  return { month: month + 1, year };
}

function parseDateToMonthParts(value: string, context: string): ParsedMonth {
  if (!value) {
    throw new Error(`Invalid ${context}: missing date value`);
  }

  const trimmed = value.trim();
  const match = ISO_MONTH_PATTERN.exec(trimmed);

  if (!match) {
    throw new Error(`Invalid ${context}: expected YYYY-MM or YYYY-MM-DD`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : 1;

  if (!Number.isInteger(year)) {
    throw new Error(`Invalid ${context}: year must be integer`);
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid ${context}: month must be between 1 and 12`);
  }

  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`Invalid ${context}: day must be between 1 and 31`);
  }

  const timestamp = Date.UTC(year, month - 1, day);
  const monthKey = createMonthKey(year, month);

  return { month, year, timestamp, monthKey };
}

function normalizeNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function appendToBucket(map: Map<number, number>, monthKey: number, amount: number) {
  map.set(monthKey, (map.get(monthKey) ?? 0) + amount);
}

function resolveStoplight(
  balance: number,
  warningThreshold: number,
  dangerThreshold: number,
): "green" | "yellow" | "red" {
  if (balance < dangerThreshold) {
    return "red";
  }

  if (balance < warningThreshold) {
    return "yellow";
  }

  return "green";
}

export function buildRunwayProjection({
  budgets,
  cashFlows,
  snapshots,
  warningBalanceThreshold,
  dangerBalanceThreshold,
  monthsToProject,
}: RunwayProjectionOptions): RunwayProjectionRow[] {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    throw new Error("No account snapshots available for runway projection");
  }

  const warningThreshold = ensureFiniteNumber(warningBalanceThreshold, "warning balance threshold");
  const dangerThreshold = ensureFiniteNumber(dangerBalanceThreshold, "danger balance threshold");

  const snapshotParts = snapshots.map((snapshot) => {
    const parsed = parseDateToMonthParts(
      snapshot.date,
      `snapshot date for account ${snapshot.accountId}`,
    );
    const balance = ensureFiniteNumber(
      snapshot.balance,
      `snapshot balance for account ${snapshot.accountId}`,
    );

    return { ...parsed, balance, accountId: snapshot.accountId };
  });

  const latestByAccount = new Map<
    string,
    { monthKey: number; timestamp: number; balance: number }
  >();

  for (const snapshot of snapshotParts) {
    const existing = latestByAccount.get(snapshot.accountId);

    if (!existing || snapshot.timestamp > existing.timestamp) {
      latestByAccount.set(snapshot.accountId, {
        monthKey: snapshot.monthKey,
        timestamp: snapshot.timestamp,
        balance: snapshot.balance,
      });
    }
  }

  if (latestByAccount.size === 0) {
    throw new Error("No account snapshots available for runway projection");
  }

  let startMonthKey = Number.NEGATIVE_INFINITY;
  let startingBalance = 0;

  for (const snapshot of latestByAccount.values()) {
    startingBalance += snapshot.balance;

    if (snapshot.monthKey > startMonthKey) {
      startMonthKey = snapshot.monthKey;
    }
  }

  let endMonthKey = startMonthKey;

  const budgetTotals = new Map<number, number>();
  for (const budget of budgets) {
    const month = ensureInteger(budget.month, "budget month");
    const year = ensureInteger(budget.year, "budget year");
    const amount = ensureFiniteNumber(budget.amount, "budget amount");

    if (month < 1 || month > 12) {
      throw new Error("Invalid budget month: must be between 1 and 12");
    }

    const monthKey = createMonthKey(year, month);

    if (monthKey < startMonthKey) {
      continue;
    }

    appendToBucket(budgetTotals, monthKey, amount);
    if (monthKey > endMonthKey) {
      endMonthKey = monthKey;
    }
  }

  const postedIncome = new Map<number, number>();
  const postedExpense = new Map<number, number>();
  const plannedIncome = new Map<number, number>();
  const plannedExpense = new Map<number, number>();

  for (const flow of cashFlows) {
    if (flow.status === "void") {
      continue;
    }

    if (flow.type !== "income" && flow.type !== "expense") {
      throw new Error(`Invalid cash flow type: ${flow.type}`);
    }

    if (flow.status !== "planned" && flow.status !== "posted") {
      throw new Error(`Unsupported cash flow status: ${flow.status}`);
    }

    const identifier = flow.flowId ?? `${flow.type}-${flow.status}`;

    if (flow.status === "posted") {
      const dateSource = flow.actualDate ?? flow.plannedDate;
      const parsed = parseDateToMonthParts(dateSource, `cash flow date for ${identifier}`);

      if (parsed.monthKey < startMonthKey) {
        continue;
      }

      const amount = ensureFiniteNumber(
        flow.actualAmount ?? flow.plannedAmount,
        `cash flow posted amount for ${identifier}`,
      );

      if (flow.type === "income") {
        appendToBucket(postedIncome, parsed.monthKey, amount);
      } else {
        appendToBucket(postedExpense, parsed.monthKey, amount);
      }

      if (parsed.monthKey > endMonthKey) {
        endMonthKey = parsed.monthKey;
      }

      continue;
    }

    const parsed = parseDateToMonthParts(flow.plannedDate, `cash flow planned date for ${identifier}`);

    if (parsed.monthKey < startMonthKey) {
      continue;
    }

    const amount = ensureFiniteNumber(flow.plannedAmount, `cash flow planned amount for ${identifier}`);

    if (flow.type === "income") {
      appendToBucket(plannedIncome, parsed.monthKey, amount);
    } else {
      appendToBucket(plannedExpense, parsed.monthKey, amount);
    }

    if (parsed.monthKey > endMonthKey) {
      endMonthKey = parsed.monthKey;
    }
  }

  if (monthsToProject !== undefined) {
    const projectionLength = ensureInteger(monthsToProject, "months to project");

    if (projectionLength < 1) {
      throw new Error("monthsToProject must be at least 1");
    }

    const projectedEndKey = startMonthKey + projectionLength - 1;

    if (projectedEndKey > endMonthKey) {
      endMonthKey = projectedEndKey;
    }
  }

  const rows: RunwayProjectionRow[] = [];
  let currentStartingBalance = startingBalance;

  for (let monthKey = startMonthKey; monthKey <= endMonthKey; monthKey += 1) {
    const { month, year } = monthKeyToParts(monthKey);

    const budgetTotal = budgetTotals.get(monthKey) ?? 0;
    const actualIncomeTotal = postedIncome.get(monthKey) ?? 0;
    const actualExpenseTotal = postedExpense.get(monthKey) ?? 0;
    const plannedIncomeTotal = plannedIncome.get(monthKey) ?? 0;
    const plannedExpenseTotal = plannedExpense.get(monthKey) ?? 0;

    const projectedIncomeTotal = actualIncomeTotal + plannedIncomeTotal;
    const projectedExpenseTotal = actualExpenseTotal + plannedExpenseTotal + budgetTotal;

    const actualEndingBalance = currentStartingBalance + actualIncomeTotal - actualExpenseTotal;
    const projectedEndingBalance =
      currentStartingBalance + projectedIncomeTotal - projectedExpenseTotal;

    rows.push({
      month,
      year,
      startingBalance: normalizeNumber(currentStartingBalance),
      actualIncomeTotal: normalizeNumber(actualIncomeTotal),
      projectedIncomeTotal: normalizeNumber(projectedIncomeTotal),
      actualExpenseTotal: normalizeNumber(actualExpenseTotal),
      projectedExpenseTotal: normalizeNumber(projectedExpenseTotal),
      actualEndingBalance: normalizeNumber(actualEndingBalance),
      projectedEndingBalance: normalizeNumber(projectedEndingBalance),
      stoplightStatus: resolveStoplight(projectedEndingBalance, warningThreshold, dangerThreshold),
      notes: "",
    });

    currentStartingBalance = projectedEndingBalance;
  }

  return rows;
}
