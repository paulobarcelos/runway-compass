// ABOUTME: Coordinates budget plan loading, editing, and saving flows.
// ABOUTME: Exposes grid state derived from Sheets to drive the budget UI.
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import { useBaseCurrency } from "@/components/currency/base-currency-context";
import {
  useSpreadsheetHealth,
} from "@/components/spreadsheet/spreadsheet-health-context";
import {
  filterSheetIssues,
  shouldReloadAfterBootstrap,
  shouldRetryAfterRecovery,
} from "@/components/spreadsheet/spreadsheet-health-helpers";
import {
  loadManifest,
  manifestStorageKey,
  type ManifestRecord,
} from "@/lib/manifest-store";
import { subscribeToManifestChange } from "@/lib/manifest-events";
import { debugLog } from "@/lib/debug-log";
import {
  fetchBudgetPlan,
  saveBudgetPlan,
} from "@/lib/api/budget-plan-client";
import {
  buildBudgetPlanGrid,
  type BudgetPlanGrid,
  type BudgetPlanMonth,
  type BudgetPlanRow,
} from "@/lib/budget-plan/grid-transforms";
import type {
  BudgetHorizonMetadata,
  BudgetPlanRecord,
} from "@/server/google/repository/budget-horizon-repository";
import {
  applyMoneyChange,
  createBudgetPlanDraft,
  isBudgetPlanDraftDirty,
  serializeBudgetPlanDraft,
  type BudgetPlanDraft,
} from "@/lib/budget-plan/change-tracker";
import type { CategoryRecord } from "@/server/google/repository/categories-repository";

const BUDGET_PLAN_SHEET_ID = "budget_plan";

type LoadState = "idle" | "loading" | "ready" | "error";

export type BudgetPlanManagerStatus =
  | "idle"
  | "loading"
  | "ready"
  | "blocked"
  | "error";

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
}

interface UseBudgetPlanManagerOptions {
  startDate?: Date;
}

type BudgetCategory = CategoryRecord & {
  flowType?: "income" | "expense";
  rolloverFlag?: boolean;
  monthlyBudget?: number;
  currencyCode?: string;
};

interface FetchBudgetPlanResult {
  grid: BudgetPlanGrid;
  draft: BudgetPlanDraft;
  categories: BudgetCategory[];
  metadata: BudgetHorizonMetadata;
}

function normalizeCategoryRecord(entry: Record<string, unknown>): BudgetCategory {
  const categoryId = String(entry.categoryId ?? "").trim();
  const label = String(entry.label ?? "").trim();
  const color = String(entry.color ?? "").trim() || "#999999";
  const description = String(entry.description ?? "").trim();
  const sortOrder =
    typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder)
      ? entry.sortOrder
      : 0;
  const flowType =
    String(entry.flowType ?? "")
      .trim()
      .toLowerCase() === "income"
      ? "income"
      : "expense";
  const rolloverFlag = Boolean(entry.rolloverFlag);
  const monthlyBudget =
    typeof entry.monthlyBudget === "number" && Number.isFinite(entry.monthlyBudget)
      ? entry.monthlyBudget
      : 0;
  const currencyCode = String(entry.currencyCode ?? "").trim().toUpperCase();

  return {
    categoryId,
    label,
    color,
    description,
    sortOrder,
    flowType,
    rolloverFlag,
    monthlyBudget,
    currencyCode,
  };
}

async function fetchCategories(spreadsheetId: string): Promise<BudgetCategory[]> {
  const response = await fetch(
    `/api/categories?spreadsheetId=${encodeURIComponent(spreadsheetId)}`,
  );
  const payload = (await response.json().catch(() => ({}))) as {
    categories?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    const message =
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : "Failed to load categories";
    throw new Error(message);
  }

  const source = Array.isArray(payload?.categories) ? payload.categories : [];
  const normalized = source
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => normalizeCategoryRecord(item as Record<string, unknown>))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.label.localeCompare(right.label);
    });

  return normalized;
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
        baseCurrencyDisplay:
          converted == null ? null : formatAmount(converted, approximate),
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

function isoStartFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function useManifestState(): ManifestRecord | null {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateManifest = () => {
      const stored = loadManifest(window.localStorage);
      setManifest(stored);
    };

    updateManifest();
    void debugLog("Budget plan manager loaded manifest", loadManifest(window.localStorage));

    const unsubscribe = subscribeToManifestChange((record) => {
      setManifest(record as ManifestRecord | null);
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === manifestStorageKey()) {
        updateManifest();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      unsubscribe();
    };
  }, []);

  return manifest;
}

function usePrevious<T>(value: T): MutableRefObject<T | undefined> {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

async function loadBudgetPlanData({
  spreadsheetId,
  startDate,
}: {
  spreadsheetId: string;
  startDate: Date | undefined;
}): Promise<FetchBudgetPlanResult> {
  const categories = await fetchCategories(spreadsheetId);
  const response = await fetchBudgetPlan(spreadsheetId);
  const startOverride = startDate ?? new Date(response.meta.start);

  const grid = buildBudgetPlanGrid({
    categories,
    budgetPlan: response.budgetPlan,
    startDate: startOverride,
    horizon: response.meta.months,
  });

  const draft = createBudgetPlanDraft(grid);
  const normalizedMetadata: BudgetHorizonMetadata = {
    start: isoStartFromDate(startOverride),
    months: response.meta.months,
  };

  return {
    grid,
    draft,
    categories,
    metadata: normalizedMetadata,
  };
}

export function useBudgetPlanManager(
  options: UseBudgetPlanManagerOptions = {},
): BudgetPlanManagerState {
  const manifest = useManifestState();
  const spreadsheetId = manifest?.spreadsheetId ?? null;

  const { diagnostics } = useSpreadsheetHealth();
  const {
    baseCurrency,
    convertAmount,
    formatAmount,
  } = useBaseCurrency();

  const budgetHealth = useMemo(
    () =>
      filterSheetIssues(diagnostics, {
        sheetId: BUDGET_PLAN_SHEET_ID,
        fallbackTitle: "Budget plan",
      }),
    [diagnostics],
  );

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [baselineGrid, setBaselineGrid] = useState<BudgetPlanGrid | null>(null);
  const [baselineCategories, setBaselineCategories] = useState<BudgetCategory[]>([]);
  const [draft, setDraft] = useState<BudgetPlanDraft | null>(null);
  const [metadata, setMetadata] = useState<BudgetHorizonMetadata | null>(null);
  const [isHorizonUpdating, setIsHorizonUpdating] = useState(false);
  const [horizonError, setHorizonError] = useState<string | null>(null);

  const startDateInput = options.startDate ?? null;
  const startDate = useMemo(
    () => (startDateInput ? new Date(startDateInput) : undefined),
    [startDateInput],
  );

  const manifestStoredAt = manifest?.storedAt ?? null;
  const previousManifestStoredAtRef = usePrevious<number | null>(manifestStoredAt);
  const previousHealthBlockedRef = usePrevious<boolean>(budgetHealth.hasErrors);

  const loadBudgetPlan = useCallback(
    async (id: string) => {
      setLoadState("loading");
      setLoadError(null);
      setSaveError(null);
      setLastSavedAt(null);
      setMetadata(null);
      setHorizonError(null);

      try {
        const {
          grid,
          draft: loadedDraft,
          categories,
          metadata: loadedMetadata,
        } =
          await loadBudgetPlanData({
            spreadsheetId: id,
            startDate,
          });

        setBaselineGrid(grid);
        setBaselineCategories(categories);
        setDraft(cloneDraft(loadedDraft));
        setMetadata(loadedMetadata);
        setLoadState("ready");
        void debugLog("Budget plan loaded", {
          categories: categories.length,
          records: grid.rows.reduce((total, row) => total + row.cells.length, 0),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load budget plan";
        setLoadState("error");
        setLoadError(message);
        setBaselineGrid(null);
        setBaselineCategories([]);
        setDraft(null);
        setMetadata(null);
        void debugLog("Budget plan load error", { message });
      }
    },
    [startDate],
  );

  useEffect(() => {
    if (!spreadsheetId) {
      setLoadState("idle");
      setLoadError(null);
      setSaveError(null);
      setLastSavedAt(null);
      setBaselineGrid(null);
      setBaselineCategories([]);
      setDraft(null);
      setMetadata(null);
      return;
    }

    if (budgetHealth.hasErrors) {
      return;
    }

    void loadBudgetPlan(spreadsheetId);
  }, [spreadsheetId, budgetHealth.hasErrors, loadBudgetPlan, startDate]);

  useEffect(() => {
    if (!spreadsheetId) {
      return;
    }

    const previousBlocked = previousHealthBlockedRef.current ?? false;

    if (shouldRetryAfterRecovery(previousBlocked, budgetHealth.hasErrors)) {
      void loadBudgetPlan(spreadsheetId);
    }
  }, [
    budgetHealth.hasErrors,
    loadBudgetPlan,
    previousHealthBlockedRef,
    spreadsheetId,
  ]);

  useEffect(() => {
    if (!spreadsheetId) {
      return;
    }

    const previousStoredAt = previousManifestStoredAtRef.current ?? null;

    if (shouldReloadAfterBootstrap(previousStoredAt, manifestStoredAt)) {
      void loadBudgetPlan(spreadsheetId);
    }
  }, [
    loadBudgetPlan,
    manifestStoredAt,
    previousManifestStoredAtRef,
    spreadsheetId,
  ]);

  const months = draft?.months ?? baselineGrid?.months ?? [];

  const {
    rows,
    grandTotalBaseAmount,
    grandTotalBaseDisplay,
    grandTotalApproximate,
    grandTotalTone,
  } = useMemo(
    () => createViewRows(draft, baseCurrency, convertAmount, formatAmount),
    [draft, baseCurrency, convertAmount, formatAmount],
  );

  const isDirty = draft ? isBudgetPlanDraftDirty(draft) : false;
  const blockingMessage = budgetHealth.hasErrors
    ? `Spreadsheet health flagged issues with the ${budgetHealth.sheetTitle} tab. Fix the problems above, then reload.`
    : null;

  const status: BudgetPlanManagerStatus = (() => {
    if (!spreadsheetId) {
      return "idle";
    }

    if (budgetHealth.hasErrors) {
      return "blocked";
    }

    if (loadState === "error") {
      return "error";
    }

    if (loadState === "loading") {
      return "loading";
    }

    if (draft) {
      return "ready";
    }

    return "idle";
  })();

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
      setDraft((current) => {
        if (!current) {
          return current;
        }

        const row = current.rows.find(
          (item) => item.category.categoryId === categoryId,
        );
        const currency = row?.cells[monthIndex]?.currency ?? baseCurrency;

        try {
          return applyMoneyChange(current, {
            categoryId,
            monthIndex,
            amount,
            currency,
          });
        } catch (error) {
          void debugLog("Budget plan amount change error", {
            message: error instanceof Error ? error.message : String(error),
          });
          return current;
        }
      });
    },
    [baseCurrency],
  );

  const copyPreviousMonth = useCallback((categoryId: string, monthIndex: number) => {
    if (monthIndex <= 0) {
      return;
    }

    setDraft((current) => {
      if (!current) {
        return current;
      }

      const row = current.rows.find(
        (item) => item.category.categoryId === categoryId,
      );

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

      const row = current.rows.find(
        (item) => item.category.categoryId === categoryId,
      );

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

      const row = current.rows.find(
        (item) => item.category.categoryId === categoryId,
      );

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

      const row = current.rows.find(
        (item) => item.category.categoryId === categoryId,
      );

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

  const updateHorizon = useCallback(
    async (next: BudgetHorizonMetadata, action: "expand" | "shrink" | "apply") => {
      if (!spreadsheetId) {
        throw new Error("Missing spreadsheet id");
      }

      if (baselineCategories.length === 0) {
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

        setMetadata(nextMetadata);

        const nextGrid = buildBudgetPlanGrid({
          categories: baselineCategories,
          budgetPlan: updatedRecords,
          startDate: new Date(nextMetadata.start),
          horizon: nextMetadata.months,
        });

        const nextDraft = createBudgetPlanDraft(nextGrid);
        setBaselineGrid(nextGrid);
        setDraft(cloneDraft(nextDraft));
        setLastSavedAt(new Date().toISOString());
        setSaveError(null);
        setLoadError(null);
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
    [baselineCategories, spreadsheetId],
  );

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
    if (
      !spreadsheetId ||
      !draft ||
      !baselineGrid ||
      !metadata ||
      baselineCategories.length === 0 ||
      isSaving
    ) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const payload = serializeBudgetPlanDraft(draft);

    try {
      const response = await saveBudgetPlan(spreadsheetId, payload, metadata);
      const updatedRecords =
        response.budgetPlan.length > 0 ? response.budgetPlan : payload;
      const nextMetadata = response.meta;
      setMetadata(nextMetadata);
      const nextGrid = buildBudgetPlanGrid({
        categories: baselineCategories,
        budgetPlan: updatedRecords,
        startDate: new Date(nextMetadata.start),
        horizon: nextMetadata.months,
      });
      const nextDraft = createBudgetPlanDraft(nextGrid);
      setBaselineGrid(nextGrid);
      setDraft(cloneDraft(nextDraft));
      const savedAt = new Date().toISOString();
      setLastSavedAt(savedAt);
      void debugLog("Budget plan saved", {
        records: updatedRecords.length,
        savedAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save budget plan";
      setSaveError(message);
      void debugLog("Budget plan save error", { message });
    } finally {
      setIsSaving(false);
    }
  }, [
    baselineCategories,
    baselineGrid,
    draft,
    isSaving,
    metadata,
    spreadsheetId,
  ]);

  const error =
    status === "error"
      ? loadError ?? "Budget plan is temporarily unavailable."
      : null;

  return {
    status,
    blockingMessage,
    error,
    saveError,
    isSaving,
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
  };
}
