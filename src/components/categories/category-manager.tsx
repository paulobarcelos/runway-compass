// ABOUTME: Renders category management form for the connected spreadsheet.
// ABOUTME: Supports listing, editing, adding, and deleting categories.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { loadManifest, manifestStorageKey, type ManifestRecord } from "@/lib/manifest-store";
import { subscribeToManifestChange } from "@/lib/manifest-events";
import { debugLog } from "@/lib/debug-log";
import { loadExchangeRates } from "@/lib/exchange-rates";
import { convertCurrency, formatCurrency } from "@/lib/currency";
import {
  categoriesEqual,
  createBlankCategory,
  type CategoryDraft,
} from "./category-helpers";

type LoadState = "idle" | "loading" | "error" | "ready";
type SaveState = "idle" | "saving";

const BASE_CURRENCY_STORAGE_KEY = "runway-compass:base-currency";

export function CategoryManager() {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [original, setOriginal] = useState<CategoryDraft[]>([]);
  const [drafts, setDrafts] = useState<CategoryDraft[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState("USD");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateManifest = () => {
      const stored = loadManifest(window.localStorage);
      setManifest(stored);
    };

    updateManifest();
    void debugLog("Category manager loaded manifest", loadManifest(window.localStorage));

    const storedBaseCurrency = window.localStorage
      .getItem(BASE_CURRENCY_STORAGE_KEY)
      ?.trim()
      .toUpperCase();

    if (storedBaseCurrency) {
      setBaseCurrency(storedBaseCurrency);
    }

    const unsubscribe = subscribeToManifestChange((record) => {
      setManifest(record);
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(BASE_CURRENCY_STORAGE_KEY, baseCurrency);
  }, [baseCurrency]);

  useEffect(() => {
    let cancelled = false;

    const loadRates = async () => {
      try {
        const rates = await loadExchangeRates();
        if (!cancelled) {
          setExchangeRates(rates);
          setRateError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Failed to load exchange rates";
          setRateError(message);
          setExchangeRates(null);
          void debugLog("Exchange rate load error", { message });
        }
      }
    };

    void loadRates();

    return () => {
      cancelled = true;
    };
  }, []);

  const spreadsheetId = manifest?.spreadsheetId ?? null;

  const isDirty = useMemo(() => !categoriesEqual(drafts, original), [drafts, original]);
  const isSaving = saveState === "saving";
  const isLoading = loadState === "loading";

  const availableCurrencies = useMemo(() => {
    if (exchangeRates) {
      const codes = new Set<string>();
      for (const code of Object.keys(exchangeRates)) {
        codes.add(code.toUpperCase());
      }
      codes.add(baseCurrency.toUpperCase());
      return Array.from(codes).sort();
    }

    return [baseCurrency];
  }, [exchangeRates, baseCurrency]);

  const renderNormalizedBudget = useCallback(
    (category: CategoryDraft) => {
      const parsedBudget = Number.parseFloat(category.monthlyBudget);

      if (!Number.isFinite(parsedBudget) || parsedBudget === 0) {
        return "—";
      }

      if (!exchangeRates) {
        return "…";
      }

      const fromCurrency = (category.currencyCode || baseCurrency).toUpperCase();
      const targetCurrency = baseCurrency.toUpperCase();

      if (fromCurrency === targetCurrency) {
        return formatCurrency(parsedBudget, targetCurrency, false);
      }

      try {
        const normalized = convertCurrency(parsedBudget, fromCurrency, targetCurrency, exchangeRates);
        const approximate = fromCurrency !== targetCurrency;
        return formatCurrency(normalized, targetCurrency, approximate);
      } catch {
        return "—";
      }
    },
    [exchangeRates, baseCurrency],
  );

  const fetchCategories = useCallback(
    async (id: string) => {
      setLoadState("loading");
      setLoadError(null);

      try {
        const response = await fetch(`/api/categories?spreadsheetId=${encodeURIComponent(id)}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            typeof payload?.error === "string" ? payload.error : "Failed to load categories";
          throw new Error(message);
        }

        const categories = Array.isArray(payload?.categories) ? payload.categories : [];

        const normalized: CategoryDraft[] = categories
          .map((item) => ({
            categoryId: String(item.categoryId ?? "").trim(),
            label: String(item.label ?? "").trim(),
            color: String(item.color ?? "").trim() || "#999999",
            rolloverFlag: Boolean(item.rolloverFlag),
            sortOrder:
              typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
                ? item.sortOrder
                : 0,
            monthlyBudget:
              typeof item.monthlyBudget === "number" && Number.isFinite(item.monthlyBudget)
                ? item.monthlyBudget.toString()
                : "",
            currencyCode: String(item.currencyCode ?? "").trim().toUpperCase(),
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder);

        setOriginal(normalized.map((item) => ({ ...item })));
        setDrafts(normalized);
        setLoadState("ready");
        setLastSavedAt(null);

        void debugLog("Loaded categories", { count: normalized.length });
      } catch (loadException) {
        const message =
          loadException instanceof Error ? loadException.message : "Failed to load categories";
        setLoadState("error");
        setLoadError(message);
        void debugLog("Category load error", { message });
      }
    },
    [],
  );

  useEffect(() => {
    if (!spreadsheetId) {
      setOriginal([]);
      setDrafts([]);
      setLoadState("idle");
      setLoadError(null);
      return;
    }

    void fetchCategories(spreadsheetId);
  }, [spreadsheetId, fetchCategories]);

  const handleAdd = useCallback(() => {
    setDrafts((current) => {
      const nextSort =
        current.length > 0
          ? Math.max(...current.map((item) => item.sortOrder)) + 1
          : 1;
      const blank = createBlankCategory(nextSort);
      return [...current, { ...blank, currencyCode: baseCurrency }];
    });
  }, [baseCurrency]);

  const handleDelete = useCallback((categoryId: string) => {
    setDrafts((current) => current.filter((item) => item.categoryId !== categoryId));
  }, []);

  const handleFieldChange = useCallback(
    (categoryId: string, field: keyof CategoryDraft, value: string | boolean) => {
      setDrafts((current) =>
        current.map((item) => {
          if (item.categoryId !== categoryId) {
            return item;
          }

          if (field === "rolloverFlag") {
            return { ...item, rolloverFlag: Boolean(value) };
          }

          if (field === "sortOrder") {
            const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;
            return {
              ...item,
              sortOrder: Number.isFinite(parsed) ? Number(parsed) : item.sortOrder,
            };
          }

          if (field === "currencyCode") {
            return {
              ...item,
              currencyCode: typeof value === "string" ? value.trim().toUpperCase() : item.currencyCode,
            };
          }

          return { ...item, [field]: typeof value === "string" ? value : String(value) };
        }),
      );
    },
    [],
  );

  const handleReset = useCallback(() => {
    setDrafts(original.map((item) => ({ ...item })));
    setSaveError(null);
    setLastSavedAt(null);
  }, [original]);

  const handleSave = useCallback(async () => {
    if (!spreadsheetId || drafts.length === 0) {
      return;
    }

    setSaveError(null);
    setSaveState("saving");

    const payload = {
      categories: drafts.map((draft) => ({
        categoryId: draft.categoryId,
        label: draft.label.trim(),
        color: draft.color.trim() || "#999999",
        rolloverFlag: draft.rolloverFlag,
        sortOrder: Number(draft.sortOrder),
        monthlyBudget:
          draft.monthlyBudget.trim() === ""
            ? 0
            : Number.parseFloat(draft.monthlyBudget.trim()) || 0,
        currencyCode: draft.currencyCode.trim().toUpperCase(),
      })),
    };

    try {
      const response = await fetch(`/api/categories?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof body?.error === "string" ? body.error : "Failed to save categories";
        throw new Error(message);
      }

      const updated = Array.isArray(body?.categories) ? body.categories : payload.categories;

      const normalized: CategoryDraft[] = updated
        .map((item) => ({
          categoryId: String(item.categoryId ?? "").trim(),
          label: String(item.label ?? "").trim(),
          color: String(item.color ?? "").trim() || "#999999",
          rolloverFlag: Boolean(item.rolloverFlag),
          sortOrder:
            typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
              ? item.sortOrder
              : 0,
          monthlyBudget:
            typeof item.monthlyBudget === "number" && Number.isFinite(item.monthlyBudget)
              ? item.monthlyBudget.toString()
              : "",
          currencyCode: String(item.currencyCode ?? "").trim().toUpperCase(),
        }))
        .sort((left, right) => left.sortOrder - right.sortOrder);

      setOriginal(normalized.map((item) => ({ ...item })));
      setDrafts(normalized);

      const savedAt = new Date().toISOString();
      setLastSavedAt(savedAt);
      void debugLog("Saved categories", { count: normalized.length, savedAt });
    } catch (saveException) {
      const message =
        saveException instanceof Error ? saveException.message : "Failed to save categories";
      setSaveError(message);
      void debugLog("Category save error", { message });
    } finally {
      setSaveState("idle");
    }
  }, [spreadsheetId, drafts]);

  const handleManifestRefresh = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = loadManifest(window.localStorage);
    setManifest(stored);
    void debugLog("Category manager refreshed manifest", stored);
  }, []);

  const renderBody = () => {
    if (!spreadsheetId) {
      return (
        <div className="rounded-lg border border-dashed border-zinc-300/70 bg-zinc-50/60 p-6 text-sm text-zinc-600 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-300">
          <p className="font-medium text-zinc-700 dark:text-zinc-100">
            Connect a spreadsheet to manage categories.
          </p>
          <p className="mt-2 text-sm">
            Use the buttons above to select or create a sheet, then refresh categories once connected.
          </p>
          <button
            type="button"
            onClick={handleManifestRefresh}
            className="mt-4 inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Refresh manifest
          </button>
        </div>
      );
    }

    if (loadState === "loading") {
      return (
        <div className="rounded-lg border border-zinc-200/70 bg-white/70 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
          Loading categories…
        </div>
      );
    }

    if (loadState === "error") {
      return (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-6 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
          <p className="font-medium">Unable to load categories.</p>
          <p className="mt-2 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => void fetchCategories(spreadsheetId)}
            className="mt-4 inline-flex items-center rounded-md bg-rose-600 px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-rose-500"
          >
            Retry
          </button>
        </div>
      );
    }

    if (drafts.length === 0) {
      return (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-emerald-300/70 bg-emerald-50/80 p-6 text-sm text-emerald-800 dark:border-emerald-600/60 dark:bg-emerald-900/30 dark:text-emerald-100">
          <p className="font-medium">
            No categories yet. Add your first category to start planning budgets.
          </p>
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500"
          >
            Add category
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <label className="font-medium" htmlFor="base-currency-select">
              Base currency
            </label>
            <select
              id="base-currency-select"
              value={baseCurrency}
              onChange={(event) => setBaseCurrency(event.target.value.trim().toUpperCase())}
              className="rounded-md border border-zinc-300/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {availableCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>

          {rateError ? (
            <span className="text-xs text-rose-600 dark:text-rose-300">{rateError}</span>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200/70 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60">
          <table className="min-w-full divide-y divide-zinc-200/60 dark:divide-zinc-700/60">
            <thead className="bg-zinc-50/80 dark:bg-zinc-900/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Color</th>
                <th className="px-3 py-2">Monthly budget</th>
                <th className="px-3 py-2">Currency</th>
                 <th className="px-3 py-2">Normalized ({baseCurrency})</th>
                <th className="px-3 py-2">Rollover</th>
                <th className="px-3 py-2">Sort</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100/70 bg-white/80 text-sm dark:divide-zinc-800 dark:bg-zinc-900/70">
              {drafts.map((category) => (
                <tr key={category.categoryId}>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={category.label}
                      onChange={(event) =>
                        handleFieldChange(category.categoryId, "label", event.target.value)
                      }
                      placeholder="Category name"
                      className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={category.color}
                      onChange={(event) =>
                        handleFieldChange(category.categoryId, "color", event.target.value)
                      }
                      placeholder="#RRGGBB"
                      className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={category.monthlyBudget}
                      onChange={(event) =>
                        handleFieldChange(category.categoryId, "monthlyBudget", event.target.value)
                      }
                      className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      maxLength={8}
                      value={category.currencyCode}
                      onChange={(event) =>
                        handleFieldChange(category.categoryId, "currencyCode", event.target.value)
                      }
                      placeholder="SEK"
                      className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm uppercase tracking-wide text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300">
                    {renderNormalizedBudget(category)}
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={category.rolloverFlag}
                        onChange={(event) =>
                          handleFieldChange(category.categoryId, "rolloverFlag", event.target.checked)
                        }
                        className="h-4 w-4 rounded border border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      Allow rollover
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={category.sortOrder}
                      onChange={(event) =>
                        handleFieldChange(category.categoryId, "sortOrder", event.target.value)
                      }
                      className="w-24 rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(category.categoryId)}
                      className="inline-flex items-center rounded-md bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-200 dark:bg-rose-900/50 dark:text-rose-100 dark:hover:bg-rose-900"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500"
            >
              Add category
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty || isSaving}
              className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Reset changes
            </button>
          </div>

          <div className="flex items-center gap-3">
            {lastSavedAt ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Saved {new Date(lastSavedAt).toLocaleTimeString()}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void fetchCategories(spreadsheetId)}
              disabled={isSaving}
              className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || isSaving || drafts.length === 0}
              className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Categories</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Edit category labels, colors, rollover behavior, and ordering. These updates sync directly to your Google Sheet.
          </p>
        </div>
        {spreadsheetId ? (
          <div className="flex flex-col items-end text-right text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-200">
              Spreadsheet ID
            </span>
            <span className="break-all font-mono text-xs">{spreadsheetId}</span>
          </div>
        ) : null}
      </div>

      {saveError ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
          {saveError}
        </div>
      ) : null}

      {renderBody()}
    </section>
  );
}
