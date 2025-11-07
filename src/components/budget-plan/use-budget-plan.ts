// ABOUTME: Coordinates the budget plan grid state via TanStack Query + server actions.
// ABOUTME: Provides editing helpers, optimistic saves, and totals for the UI grid.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import { useBaseCurrency } from "@/components/currency/base-currency-context";
import { useCategories } from "@/components/categories/use-categories";
import {
  applyMoneyChange,
  createBudgetPlanDraft,
  isBudgetPlanDraftDirty,
  serializeBudgetPlanDraft,
  type BudgetPlanDraft,
} from "@/lib/budget-plan/change-tracker";
import {
  buildBudgetPlanGrid,
  type BudgetPlanGrid,
  type BudgetPlanMonth,
  type BudgetPlanRow,
} from "@/lib/budget-plan/grid-transforms";
import { debugLog } from "@/lib/debug-log";
import {
  formatMutationError,
  queryKeys,
  useOfflineMutationQueue,
  useSheetInvalidation,
} from "@/lib/query";
import {
  getBudgetPlan,
  saveBudgetPlan,
} from "@/app/(authenticated)/actions/budget-plan-actions";
import type { BudgetPlanRecord, BudgetHorizonMetadata } from "@/server/google/repository/budget-horizon-repository";
import type { CategoryDraft } from "@/components/categories/category-helpers";

export type BudgetPlanManagerStatus = "idle" | "loading" | "ready" | "blocked" | "error";

export interface BudgetPlanManagerCell {
  recordId: string;
  monthIndex: number;
  month: number;
  year: number;
  amount: number;
  rolloverBalance: number;
  currency: string;
  baseCurrencyDisplay: string | null;
  isGenerated: boolean;
}

export interface BudgetPlanManagerRow {
  category: BudgetPlanRow["category"];
  cells: BudgetPlanManagerCell[];
  totalBaseAmount: number;
  totalBaseDisplay: string;
  totalApproximate: boolean;
  totalTone: "positive" | "negative" | "neutral";
}

export interface BudgetPlanManagerState {
  status: BudgetPlanManagerStatus;
  blockingMessage: string | null;
  error: string | null;
  saveError: string | null;
  isSaving: boolean;
  isDirty: boolean;
  months: BudgetPlanMonth[];
  rows: BudgetPlanManagerRow[];
  lastSavedAt: string | null;
  metadata: BudgetHorizonMetadata | null;
  grandTotalBaseAmount: number;
  grandTotalBaseDisplay: string;
  grandTotalApproximate: boolean;
  grandTotalTone: "positive" | "negative" | "neutral";
  horizonError: string | null;
  isHorizonUpdating: boolean;
  updateHorizon: (
    next: BudgetHorizonMetadata,
    action: "expand" | "shrink" | "apply",
  ) => Promise<void>;
  copyPreviousMonth: (categoryId: string, monthIndex: number) => void;
  fillRemainingMonths: (categoryId: string, monthIndex: number) => void;
  fillAllMonths: (categoryId: string, monthIndex: number) => void;
  spreadEvenly: (categoryId: string, monthIndex: number) => void;
  setCellValue: (
    categoryId: string,
    monthIndex: number,
    value: { amount: number; currency: string },
  ) => void;
  setAmount: (categoryId: string, monthIndex: number, amount: number) => void;
  reset: () => void;
  save: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

interface UseBudgetPlanOptions {
  startDate?: Date;
  isBlocked?: boolean;
  blockingMessage?: string | null;
}

interface BudgetPlanPayload {
  budgetPlan: BudgetPlanRecord[];
  metadata: BudgetHorizonMetadata;
  updatedAt: string;
}

interface BudgetPlanMutationVariables {
  records: BudgetPlanRecord[];
  metadata: BudgetHorizonMetadata;
}

type BudgetCategory = CategoryDraft & {
  flowType?: "income" | "expense";
  rolloverFlag?: boolean;
  monthlyBudget?: number;
  currencyCode?: string;
};

function normalizeCategories(drafts: CategoryDraft[]): BudgetCategory[] {
  return (drafts ?? []).map((draft) => ({
    ...draft,
    flowType: "expense",
    rolloverFlag: false,
    monthlyBudget: 0,
    currencyCode: "",
  }));
}

function cloneDraft(draft: BudgetPlanDraft | null): BudgetPlanDraft | null {
  if (!draft) {
    return null;
  }

  return {
    months: draft.months.map((month) => ({ ...month })),
    rows: draft.rows.map((row) => ({
      category: { ...row.category },
      cells: row.cells.map((cell) => ({ ...cell })),
    })),
  };
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

function createViewRows(
  draft: BudgetPlanDraft | null,
  baseCurrency: string,
  convertAmount: (amount: number, fromCurrency: string) => number | null,
  formatAmount: (amount: number, isApproximation?: boolean) => string,
): {
  rows: BudgetPlanManagerRow[];
  grandTotalBaseAmount: number;
  grandTotalBaseDisplay: string;
  grandTotalApproximate: boolean;
  grandTotalTone: "positive" | "negative" | "neutral";
} {
  if (!draft) {
    return {
      rows: [],
      grandTotalBaseAmount: 0,
      grandTotalBaseDisplay: formatAmount(0, false),
      grandTotalApproximate: false,
      grandTotalTone: "neutral",
    };
  }

  const rows: BudgetPlanManagerRow[] = [];
  let grandTotalBaseAmount = 0;
  let grandTotalApproximate = false;
  const normalizedBase = baseCurrency.toUpperCase();

  for (const row of draft.rows) {
    const cells: BudgetPlanManagerCell[] = [];
    const defaultCurrency = row.category.currencyCode || baseCurrency;
    let rowTotalBase = 0;
    let rowApproximate = false;

    for (let index = 0; index < row.cells.length; index += 1) {
      const cell = row.cells[index];
      const cellCurrency = (cell.currency || defaultCurrency).toUpperCase();
      let converted = convertAmount(cell.amount, cellCurrency);

      if (converted == null && cellCurrency === normalizedBase) {
        converted = cell.amount;
      }

      if (converted != null) {
        rowTotalBase += converted;
      }

      const approximate = cellCurrency !== normalizedBase;
      if (approximate) {
        rowApproximate = true;
      }

      cells.push({
        recordId: cell.recordId,
        monthIndex: index,
        month: cell.month,
        year: cell.year,
        amount: cell.amount,
        rolloverBalance: cell.rolloverBalance,
        currency: cellCurrency,
        baseCurrencyDisplay: converted == null ? null : formatAmount(converted, approximate),
        isGenerated: cell.isGenerated,
      });
    }

    const totalDisplay = formatAmount(rowTotalBase, rowApproximate);
    grandTotalBaseAmount += rowTotalBase;
    grandTotalApproximate = grandTotalApproximate || rowApproximate;
    const totalTone = resolveTone(rowTotalBase);

    rows.push({
      category: { ...row.category },
      cells,
      totalBaseAmount: rowTotalBase,
      totalBaseDisplay: totalDisplay,
      totalApproximate: rowApproximate,
      totalTone,
    });
  }

  const grandTotalTone = resolveTone(grandTotalBaseAmount);

  return {
    rows,
    grandTotalBaseAmount,
    grandTotalBaseDisplay: formatAmount(grandTotalBaseAmount, grandTotalApproximate),
    grandTotalApproximate,
    grandTotalTone,
  };
}

export interface UseBudgetPlanResult extends BudgetPlanManagerState {
  refresh: () => Promise<unknown>;
}

export function useBudgetPlan(
  spreadsheetId: string | null,
  options: UseBudgetPlanOptions = {},
): UseBudgetPlanResult {
  const queryClient = useQueryClient();
  const { baseCurrency, convertAmount, formatAmount } = useBaseCurrency();
  const { query: categoriesQuery } = useCategories(spreadsheetId);
  const { invalidate } = useSheetInvalidation(spreadsheetId ?? undefined);

  const categories = useMemo(
    () => normalizeCategories(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  );

  const [baselineGrid, setBaselineGrid] = useState<BudgetPlanGrid | null>(null);
  const [draft, setDraft] = useState<BudgetPlanDraft | null>(null);
  const [metadata, setMetadata] = useState<BudgetHorizonMetadata | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [horizonError, setHorizonError] = useState<string | null>(null);
  const [isHorizonUpdating, setIsHorizonUpdating] = useState(false);

  const enabled = Boolean(spreadsheetId) && !options.isBlocked;
  const budgetPlanKey = useMemo(
    () =>
      spreadsheetId
        ? queryKeys.budgetPlan(spreadsheetId)
        : (["sheet", "noop", "budget-plan"] as const),
    [spreadsheetId],
  );

  const budgetPlanQuery: UseQueryResult<BudgetPlanPayload> = useQuery<BudgetPlanPayload>({
    queryKey: budgetPlanKey,
    enabled,
    refetchInterval: enabled ? 30_000 : false, // keep heavy grid close to live sheet when editing
    queryFn: async () => {
      if (!spreadsheetId) {
        return {
          budgetPlan: [],
          metadata: { start: new Date().toISOString().slice(0, 10), months: 12 },
          updatedAt: new Date().toISOString(),
        };
      }

      return getBudgetPlan({ spreadsheetId });
    },
  });
  const refetchBudgetPlan = budgetPlanQuery.refetch;

  useEffect(() => {
    if (!enabled) {
      setBaselineGrid(null);
      setDraft(null);
      setMetadata(null);
      setLastSavedAt(null);
      setSaveError(null);
      setLoadError(null);
      return;
    }

    if (!budgetPlanQuery.data) {
      if (budgetPlanQuery.isError) {
        setLoadError(formatMutationError(budgetPlanQuery.error));
      }
      return;
    }

    const response = budgetPlanQuery.data;
    const startDate = options.startDate ?? new Date(response.metadata.start);
    const grid = buildBudgetPlanGrid({
      categories,
      budgetPlan: response.budgetPlan,
      startDate,
      horizon: response.metadata.months,
    });
    const nextDraft = createBudgetPlanDraft(grid);

    setBaselineGrid(grid);
    setDraft(cloneDraft(nextDraft));
    setMetadata({ ...response.metadata });
    setLastSavedAt(response.updatedAt ?? new Date().toISOString());
    setLoadError(null);

    void debugLog("Budget plan hydrated", {
      categories: categories.length,
      records: response.budgetPlan.length,
    });
  }, [
    enabled,
    budgetPlanQuery.data,
    budgetPlanQuery.error,
    budgetPlanQuery.isError,
    categories,
    options.startDate,
  ]);

  type BudgetPlanMutationContext = { previous?: BudgetPlanPayload };

  const mutation = useMutation<
    BudgetPlanPayload,
    Error,
    BudgetPlanMutationVariables,
    BudgetPlanMutationContext
  >({
    mutationFn: async (variables) => {
      if (!spreadsheetId) {
        throw new Error("Missing spreadsheetId");
      }

      return saveBudgetPlan({
        spreadsheetId,
        budgetPlan: variables.records,
        metadata: variables.metadata,
      });
    },
    onMutate: async (variables) => {
      if (!spreadsheetId) {
        return { previous: undefined } satisfies BudgetPlanMutationContext;
      }

      await queryClient.cancelQueries({ queryKey: budgetPlanKey });
      const previous = queryClient.getQueryData<BudgetPlanPayload>(budgetPlanKey);
      const optimistic: BudgetPlanPayload = {
        budgetPlan: variables.records,
        metadata: variables.metadata,
        updatedAt: new Date().toISOString(),
      };
      queryClient.setQueryData(budgetPlanKey, optimistic);

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (spreadsheetId && context?.previous) {
        queryClient.setQueryData(budgetPlanKey, context.previous);
      }

      const message = formatMutationError(error);
      setSaveError(message);
      console.error("Budget plan save error", message);
    },
    onSuccess: (data) => {
      if (spreadsheetId) {
        queryClient.setQueryData(budgetPlanKey, data);
      }

      setSaveError(null);
      setLastSavedAt(data.updatedAt ?? new Date().toISOString());
    },
  });

  const offlineQueue = useOfflineMutationQueue(mutation, {
    onReconnect: invalidate,
  });

  const months = draft?.months ?? baselineGrid?.months ?? [];

  const { rows, grandTotalBaseAmount, grandTotalBaseDisplay, grandTotalApproximate, grandTotalTone } =
    useMemo(
      () => createViewRows(draft, baseCurrency, convertAmount, formatAmount),
      [baseCurrency, convertAmount, draft, formatAmount],
    );

  const isDirty = draft ? isBudgetPlanDraftDirty(draft) : false;

  const setCellValue = useCallback(
    (
      categoryId: string,
      monthIndex: number,
      value: { amount: number; currency: string },
    ) => {
      setDraft((current) => {
        if (!current) {
          return current;
        }

        const safeAmount = Number.isFinite(value.amount) ? value.amount : 0;
        const normalizedCurrency = value.currency?.trim().toUpperCase();
        const fallbackCurrency = normalizedCurrency || baseCurrency.toUpperCase();

        try {
          return applyMoneyChange(current, {
            categoryId,
            monthIndex,
            amount: safeAmount,
            currency: fallbackCurrency,
          });
        } catch (error) {
          void debugLog("Budget plan cell change error", {
            message: error instanceof Error ? error.message : String(error),
          });
          return current;
        }
      });
    },
    [baseCurrency],
  );

  const setAmount = useCallback(
    (categoryId: string, monthIndex: number, amount: number) => {
      setCellValue(categoryId, monthIndex, {
        amount,
        currency: baseCurrency,
      });
    },
    [baseCurrency, setCellValue],
  );

  const copyPreviousMonth = useCallback((categoryId: string, monthIndex: number) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const row = current.rows.find((item) => item.category.categoryId === categoryId);

      if (!row) {
        return current;
      }

      const previousCell = row.cells[monthIndex - 1];

      if (!previousCell) {
        return current;
      }

      try {
        return applyMoneyChange(current, {
          categoryId,
          monthIndex,
          amount: previousCell.amount,
          currency: previousCell.currency,
        });
      } catch (error) {
        void debugLog("Budget plan copy previous error", {
          message: error instanceof Error ? error.message : String(error),
        });
        return current;
      }
    });
  }, []);

  const fillRemainingMonths = useCallback((categoryId: string, monthIndex: number) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const row = current.rows.find((item) => item.category.categoryId === categoryId);

      if (!row) {
        return current;
      }

      const sourceCell = row.cells[monthIndex];

      if (!sourceCell) {
        return current;
      }

      let nextDraft: BudgetPlanDraft = current;

      try {
        for (let index = monthIndex; index < row.cells.length; index += 1) {
          nextDraft = applyMoneyChange(nextDraft, {
            categoryId,
            monthIndex: index,
            amount: sourceCell.amount,
            currency: sourceCell.currency,
          });
        }
      } catch (error) {
        void debugLog("Budget plan fill remaining error", {
          message: error instanceof Error ? error.message : String(error),
        });
        return current;
      }

      return nextDraft;
    });
  }, []);

  const fillAllMonths = useCallback((categoryId: string, monthIndex: number) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const row = current.rows.find((item) => item.category.categoryId === categoryId);

      if (!row) {
        return current;
      }

      const sourceCell = row.cells[monthIndex];

      if (!sourceCell) {
        return current;
      }

      let nextDraft: BudgetPlanDraft = current;

      try {
        for (let index = 0; index < row.cells.length; index += 1) {
          nextDraft = applyMoneyChange(nextDraft, {
            categoryId,
            monthIndex: index,
            amount: sourceCell.amount,
            currency: sourceCell.currency,
          });
        }
      } catch (error) {
        void debugLog("Budget plan fill all error", {
          message: error instanceof Error ? error.message : String(error),
        });
        return current;
      }

      return nextDraft;
    });
  }, []);

  const spreadEvenly = useCallback((categoryId: string, monthIndex: number) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const row = current.rows.find((item) => item.category.categoryId === categoryId);

      if (!row) {
        return current;
      }

      const sourceCell = row.cells[monthIndex];

      if (!sourceCell) {
        return current;
      }

      const cellCount = row.cells.length;

      if (cellCount === 0) {
        return current;
      }

      const decimals = Math.round(sourceCell.amount * 100);
      const baseShare = Math.trunc(decimals / cellCount);
      let remainder = decimals - baseShare * cellCount;

      let nextDraft: BudgetPlanDraft = current;

      try {
        for (let index = 0; index < row.cells.length; index += 1) {
          let share = baseShare;

          if (remainder > 0) {
            share += 1;
            remainder -= 1;
          } else if (remainder < 0) {
            share -= 1;
            remainder += 1;
          }

          nextDraft = applyMoneyChange(nextDraft, {
            categoryId,
            monthIndex: index,
            amount: share / 100,
            currency: sourceCell.currency,
          });
        }
      } catch (error) {
        void debugLog("Budget plan spread evenly error", {
          message: error instanceof Error ? error.message : String(error),
        });
        return current;
      }

      return nextDraft;
    });
  }, []);

  const reset = useCallback(() => {
    if (!baselineGrid) {
      return;
    }

    const nextDraft = createBudgetPlanDraft(baselineGrid);
    setDraft(cloneDraft(nextDraft));
    setSaveError(null);
    setLastSavedAt(null);
  }, [baselineGrid]);

  const save = useCallback(async () => {
    if (!draft || !metadata) {
      return;
    }

    const payload = serializeBudgetPlanDraft(draft);

    mutation.reset();
    setSaveError(null);

    try {
      if (!offlineQueue.isOnline) {
        setSaveError("Offline: changes will sync when reconnected.");
      }

      await offlineQueue.enqueue({
        records: payload,
        metadata,
      });
    } catch (error) {
      const message = formatMutationError(error);
      setSaveError(message);
      console.error("Budget plan save error", message);
    }
  }, [draft, metadata, mutation, offlineQueue]);

  const refresh = useCallback(async () => {
    if (!spreadsheetId) {
      return;
    }

    setLoadError(null);
    setSaveError(null);
    await invalidate();
    return refetchBudgetPlan();
  }, [invalidate, refetchBudgetPlan, spreadsheetId]);

  const updateHorizon = useCallback(
    async (next: BudgetHorizonMetadata, action: "expand" | "shrink" | "apply") => {
      if (!spreadsheetId) {
        throw new Error("Missing spreadsheet id");
      }

      if (categories.length === 0) {
        throw new Error("Categories not loaded");
      }

      setIsHorizonUpdating(true);
      setHorizonError(null);

      try {
        const response = await fetch(
          `/api/budget-horizon/horizon?spreadsheetId=${encodeURIComponent(spreadsheetId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action, meta: next }),
          },
        );

        const payload = (await response.json().catch(() => ({}))) as {
          budgetPlan?: BudgetPlanRecord[];
          meta?: BudgetHorizonMetadata;
          error?: string;
        };

        if (!response.ok) {
          const message = payload.error?.trim() || "Failed to update horizon";
          throw new Error(message);
        }

        const updatedRecords = Array.isArray(payload.budgetPlan) ? payload.budgetPlan : [];
        const nextMetadata = payload.meta ?? next;

        const nextGrid = buildBudgetPlanGrid({
          categories,
          budgetPlan: updatedRecords,
          startDate: new Date(nextMetadata.start),
          horizon: nextMetadata.months,
        });

        const nextDraft = createBudgetPlanDraft(nextGrid);
        setBaselineGrid(nextGrid);
        setDraft(cloneDraft(nextDraft));
        setMetadata(nextMetadata);
        setLastSavedAt(new Date().toISOString());
        setSaveError(null);
        queryClient.setQueryData<BudgetPlanPayload>(budgetPlanKey, {
          budgetPlan: updatedRecords,
          metadata: nextMetadata,
          updatedAt: new Date().toISOString(),
        });
        void debugLog("Budget horizon updated", {
          action,
          start: nextMetadata.start,
          months: nextMetadata.months,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update horizon";
        setHorizonError(message);
        void debugLog("Budget horizon update error", { message, action });
      } finally {
        setIsHorizonUpdating(false);
      }
    },
    [budgetPlanKey, categories, queryClient, spreadsheetId],
  );

  const blockingMessage = options.blockingMessage ?? null;

  const status: BudgetPlanManagerStatus = (() => {
    if (!spreadsheetId) {
      return "idle";
    }

    if (options.isBlocked) {
      return "blocked";
    }

    if (categoriesQuery.isError || budgetPlanQuery.isError) {
      return "error";
    }

    if (categoriesQuery.isLoading || budgetPlanQuery.isLoading) {
      return "loading";
    }

    if (draft) {
      return "ready";
    }

    if (budgetPlanQuery.status === "pending") {
      return "loading";
    }

    return "idle";
  })();

  const combinedError = status === "error"
    ? loadError ?? formatMutationError(categoriesQuery.error ?? budgetPlanQuery.error ?? new Error("Budget plan unavailable"))
    : null;

  const managerState: BudgetPlanManagerState = {
    status,
    blockingMessage,
    error: combinedError,
    saveError,
    isSaving: mutation.isPending || offlineQueue.pending > 0,
    isDirty,
    months,
    rows,
    lastSavedAt,
    metadata,
    grandTotalBaseAmount,
    grandTotalBaseDisplay,
    grandTotalApproximate,
    grandTotalTone,
    horizonError,
    isHorizonUpdating,
    updateHorizon,
    copyPreviousMonth,
    fillRemainingMonths,
    fillAllMonths,
    spreadEvenly,
    setCellValue,
    setAmount,
    reset,
    save,
    refresh,
  };

  return managerState;
}
