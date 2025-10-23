// ABOUTME: Builds normalized budget plan grid rows for UI consumption.
// ABOUTME: Computes rolling months, seeded amounts, and rollover balances.
import type { CategoryRecord } from "@/server/google/repository/categories-repository";
import type { BudgetPlanRecord } from "@/server/google/repository/budget-plan-repository";

const DEFAULT_HORIZON_MONTHS = 12;

export interface BudgetPlanMonth {
  id: string;
  month: number;
  year: number;
  index: number;
}

export interface BudgetPlanCategorySummary {
  categoryId: string;
  label: string;
  color: string;
  rolloverFlag: boolean;
  monthlyBudget: number;
  currencyCode: string;
}

export interface BudgetPlanCell {
  recordId: string;
  categoryId: string;
  month: number;
  year: number;
  amount: number;
  rolloverBalance: number;
  isGenerated: boolean;
}

export interface BudgetPlanRow {
  category: BudgetPlanCategorySummary;
  cells: BudgetPlanCell[];
}

export interface BudgetPlanGrid {
  months: BudgetPlanMonth[];
  rows: BudgetPlanRow[];
}

export interface BuildBudgetPlanGridOptions {
  categories: CategoryRecord[];
  budgetPlan: BudgetPlanRecord[];
  startDate?: Date;
  horizon?: number;
}

interface BudgetPlanRecordKeyParts {
  categoryId: string;
  year: number;
  month: number;
}

function padMonth(month: number) {
  return String(month).padStart(2, "0");
}

function makeRecordKey({ categoryId, year, month }: BudgetPlanRecordKeyParts) {
  return `${categoryId}:${year}-${padMonth(month)}`;
}

export function generateBudgetPlanRecordId({
  categoryId,
  year,
  month,
}: BudgetPlanRecordKeyParts) {
  return `budget_${categoryId}_${year}-${padMonth(month)}`;
}

function normalizeStartDate(date: Date | undefined) {
  const reference = date ? new Date(date) : new Date();
  return new Date(reference.getFullYear(), reference.getMonth(), 1);
}

function buildMonths(startDate: Date, horizon: number): BudgetPlanMonth[] {
  const months: BudgetPlanMonth[] = [];

  for (let index = 0; index < horizon; index += 1) {
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
    const monthNumber = cursor.getMonth() + 1;
    const year = cursor.getFullYear();

    months.push({
      id: `${year}-${padMonth(monthNumber)}`,
      month: monthNumber,
      year,
      index,
    });
  }

  return months;
}

function normalizeMonthlyBudget(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function sortCategories(left: CategoryRecord, right: CategoryRecord) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.label.localeCompare(right.label);
}

export function buildBudgetPlanGrid({
  categories,
  budgetPlan,
  startDate: rawStartDate,
  horizon = DEFAULT_HORIZON_MONTHS,
}: BuildBudgetPlanGridOptions): BudgetPlanGrid {
  const startDate = normalizeStartDate(rawStartDate);
  const months = buildMonths(startDate, horizon);

  const recordLookup = new Map<string, BudgetPlanRecord>();

  for (const record of budgetPlan) {
    const key = makeRecordKey({
      categoryId: record.categoryId,
      year: record.year,
      month: record.month,
    });

    recordLookup.set(key, record);
  }

  const sortedCategories = [...categories].sort(sortCategories);
  const rows: BudgetPlanRow[] = [];

  for (const category of sortedCategories) {
    const monthlyBudget = normalizeMonthlyBudget(category.monthlyBudget);
    const summary: BudgetPlanCategorySummary = {
      categoryId: category.categoryId,
      label: category.label,
      color: category.color,
      rolloverFlag: Boolean(category.rolloverFlag),
      monthlyBudget,
      currencyCode: category.currencyCode,
    };

    const cells: BudgetPlanCell[] = [];
    let runningRollover = 0;

    for (const month of months) {
      const key = makeRecordKey({
        categoryId: category.categoryId,
        year: month.year,
        month: month.month,
      });

      const record = recordLookup.get(key);
      const amount = record?.amount ?? monthlyBudget;
      const isGenerated = !record;
      const recordId =
        record?.recordId ??
        generateBudgetPlanRecordId({
          categoryId: category.categoryId,
          year: month.year,
          month: month.month,
        });

      let rolloverBalance = 0;

      if (category.rolloverFlag) {
        const openingBalance = Math.max(0, runningRollover);
        rolloverBalance = openingBalance;
        const diff = monthlyBudget - amount;
        const closingBalance = openingBalance + diff;
        runningRollover = Math.max(0, closingBalance);
      }

      cells.push({
        recordId,
        categoryId: category.categoryId,
        month: month.month,
        year: month.year,
        amount,
        rolloverBalance,
        isGenerated,
      });
    }

    rows.push({
      category: summary,
      cells,
    });
  }

  return { months, rows };
}
