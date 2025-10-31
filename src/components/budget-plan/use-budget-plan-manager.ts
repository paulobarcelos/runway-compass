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
import {
  applyAmountChange,
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
  baseCurrencyDisplay: string | null;
  isGenerated: boolean;
}

export interface BudgetPlanManagerRow {
  category: BudgetPlanRow["category"];
  cells: BudgetPlanManagerCell[];
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
  setAmount: (categoryId: string, monthIndex: number, amount: number) => void;
  reset: () => void;
  save: () => Promise<void>;
}

interface UseBudgetPlanManagerOptions {
  startDate?: Date;
}

interface FetchBudgetPlanResult {
  grid: BudgetPlanGrid;
  draft: BudgetPlanDraft;
  categories: CategoryRecord[];
}

function normalizeCategoryRecord(entry: Record<string, unknown>): CategoryRecord {
  const categoryId = String(entry.categoryId ?? "").trim();
  const label = String(entry.label ?? "").trim();
  const color = String(entry.color ?? "").trim() || "#999999";
  const flowType =
    String(entry.flowType ?? "")
      .trim()
      .toLowerCase() === "income"
      ? "income"
      : "expense";
  const rolloverFlag = Boolean(entry.rolloverFlag);
  const sortOrder =
    typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder)
      ? entry.sortOrder
      : 0;
  const monthlyBudgetRaw =
    typeof entry.monthlyBudget === "number" && Number.isFinite(entry.monthlyBudget)
      ? entry.monthlyBudget
      : 0;
  const currencyCode = String(entry.currencyCode ?? "").trim().toUpperCase() || "USD";

  return {
    categoryId,
    label,
    color,
    flowType,
    rolloverFlag,
    sortOrder,
    monthlyBudget: monthlyBudgetRaw,
    currencyCode,
  };
}

async function fetchCategories(spreadsheetId: string): Promise<CategoryRecord[]> {
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

function createViewRows(
  draft: BudgetPlanDraft | null,
  baseCurrency: string,
  convertAmount: (amount: number, fromCurrency: string) => number | null,
  formatAmount: (amount: number, isApproximation?: boolean) => string,
): BudgetPlanManagerRow[] {
  if (!draft) {
    return [];
  }

  const rows: BudgetPlanManagerRow[] = [];

  for (const row of draft.rows) {
    const cells: BudgetPlanManagerCell[] = [];
    const categoryCurrency = row.category.currencyCode || baseCurrency;
    const approximate = categoryCurrency.toUpperCase() !== baseCurrency.toUpperCase();

    for (let index = 0; index < row.cells.length; index += 1) {
      const cell = row.cells[index];
      const converted = convertAmount(cell.amount, categoryCurrency);

      cells.push({
        recordId: cell.recordId,
        monthIndex: index,
        month: cell.month,
        year: cell.year,
        amount: cell.amount,
        rolloverBalance: cell.rolloverBalance,
        baseCurrencyDisplay:
          converted == null ? null : formatAmount(converted, approximate),
        isGenerated: cell.isGenerated,
      });
    }

    rows.push({
      category: { ...row.category },
      cells,
    });
  }

  return rows;
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
  const budgetPlan = await fetchBudgetPlan(spreadsheetId);

  const grid = buildBudgetPlanGrid({
    categories,
    budgetPlan,
    startDate,
  });

  const draft = createBudgetPlanDraft(grid);

  return {
    grid,
    draft,
    categories,
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
  const [baselineCategories, setBaselineCategories] = useState<CategoryRecord[]>([]);
  const [draft, setDraft] = useState<BudgetPlanDraft | null>(null);

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

      try {
        const { grid, draft: loadedDraft, categories } =
          await loadBudgetPlanData({
            spreadsheetId: id,
            startDate,
          });

        setBaselineGrid(grid);
        setBaselineCategories(categories);
        setDraft(cloneDraft(loadedDraft));
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

  const rows = useMemo(
    () =>
      createViewRows(draft, baseCurrency, convertAmount, formatAmount),
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

  const setAmount = useCallback(
    (categoryId: string, monthIndex: number, amount: number) => {
      setDraft((current) => {
        if (!current) {
          return current;
        }

        try {
          return applyAmountChange(current, { categoryId, monthIndex, amount });
        } catch (error) {
          void debugLog("Budget plan amount change error", {
            message: error instanceof Error ? error.message : String(error),
          });
          return current;
        }
      });
    },
    [],
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
      baselineCategories.length === 0 ||
      isSaving
    ) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const payload = serializeBudgetPlanDraft(draft);

    try {
      const updatedRecords = await saveBudgetPlan(spreadsheetId, payload);
      const nextGrid = buildBudgetPlanGrid({
        categories: baselineCategories,
        budgetPlan: updatedRecords.length > 0 ? updatedRecords : payload,
        startDate,
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
    spreadsheetId,
    startDate,
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
    setAmount,
    reset,
    save,
  };
}
