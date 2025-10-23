// ABOUTME: Manages draft budget plan state derived from grid transforms.
// ABOUTME: Validates edits, tracks dirty state, and serializes records for saves.
import type { BudgetPlanRecord } from "@/server/google/repository/budget-plan-repository";

import type {
  BudgetPlanCell,
  BudgetPlanGrid,
  BudgetPlanMonth,
  BudgetPlanRow,
} from "./grid-transforms";

export interface BudgetPlanDraftCell extends BudgetPlanCell {
  baselineAmount: number;
}

export interface BudgetPlanDraftRow {
  category: BudgetPlanRow["category"];
  cells: BudgetPlanDraftCell[];
}

export interface BudgetPlanDraft {
  months: BudgetPlanMonth[];
  rows: BudgetPlanDraftRow[];
}

interface ApplyAmountChangeOptions {
  categoryId: string;
  monthIndex: number;
  amount: number;
}

function cloneMonths(months: BudgetPlanMonth[]): BudgetPlanMonth[] {
  return months.map((month) => ({ ...month }));
}

function cloneCells(cells: BudgetPlanCell[]): BudgetPlanDraftCell[] {
  return cells.map((cell) => ({
    ...cell,
    baselineAmount: cell.amount,
  }));
}

export function createBudgetPlanDraft(grid: BudgetPlanGrid): BudgetPlanDraft {
  const months = cloneMonths(grid.months);
  const rows = grid.rows.map((row) => ({
    category: { ...row.category },
    cells: cloneCells(row.cells),
  }));

  return { months, rows };
}

function recomputeRowRollovers(row: BudgetPlanDraftRow) {
  const monthlyBudget = Number.isFinite(row.category.monthlyBudget)
    ? row.category.monthlyBudget
    : 0;

  if (!row.category.rolloverFlag) {
    return row.cells.map((cell) => ({
      ...cell,
      rolloverBalance: 0,
    }));
  }

  let running = 0;

  return row.cells.map((cell) => {
    const openingBalance = Math.max(0, running);
    const diff = monthlyBudget - cell.amount;
    const closingBalance = openingBalance + diff;
    running = Math.max(0, closingBalance);

    return {
      ...cell,
      rolloverBalance: openingBalance,
    };
  });
}

function cloneRow(row: BudgetPlanDraftRow, updatedCells: BudgetPlanDraftCell[]) {
  return {
    category: { ...row.category },
    cells: updatedCells,
  };
}

export function applyAmountChange(
  draft: BudgetPlanDraft,
  { categoryId, monthIndex, amount }: ApplyAmountChangeOptions,
): BudgetPlanDraft {
  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number");
  }

  const rowIndex = draft.rows.findIndex(
    (row) => row.category.categoryId === categoryId,
  );

  if (rowIndex === -1) {
    throw new Error(`Category ${categoryId} not found in draft`);
  }

  const targetRow = draft.rows[rowIndex];

  if (monthIndex < 0 || monthIndex >= targetRow.cells.length) {
    throw new Error(`Month index ${monthIndex} is out of range`);
  }

  const nextCells = targetRow.cells.map((cell, index) => {
    if (index !== monthIndex) {
      return { ...cell };
    }

    return {
      ...cell,
      amount,
    };
  });

  const recomputedCells = recomputeRowRollovers({
    category: targetRow.category,
    cells: nextCells,
  });

  const rows = draft.rows.map((row, index) => {
    if (index !== rowIndex) {
      return {
        category: { ...row.category },
        cells: row.cells.map((cell) => ({ ...cell })),
      };
    }

    return cloneRow(targetRow, recomputedCells);
  });

  return {
    months: cloneMonths(draft.months),
    rows,
  };
}

export function isBudgetPlanDraftDirty(draft: BudgetPlanDraft) {
  for (const row of draft.rows) {
    for (const cell of row.cells) {
      if (cell.amount !== cell.baselineAmount) {
        return true;
      }
    }
  }

  return false;
}

export function serializeBudgetPlanDraft(draft: BudgetPlanDraft): BudgetPlanRecord[] {
  const records: BudgetPlanRecord[] = [];

  for (const row of draft.rows) {
    for (const cell of row.cells) {
      records.push({
        recordId: cell.recordId,
        categoryId: cell.categoryId,
        month: cell.month,
        year: cell.year,
        amount: cell.amount,
        rolloverBalance: cell.rolloverBalance,
      });
    }
  }

  return records;
}
