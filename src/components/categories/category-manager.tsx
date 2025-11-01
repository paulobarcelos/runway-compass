// ABOUTME: Renders category management form for the connected spreadsheet.
// ABOUTME: Supports listing, editing, adding, and deleting categories with drag ordering.
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

import {
  loadManifest,
  manifestStorageKey,
  saveManifest,
  type ManifestRecord,
} from "@/lib/manifest-store";
import { emitManifestChange, subscribeToManifestChange } from "@/lib/manifest-events";
import { debugLog } from "@/lib/debug-log";
import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import {
  buildSheetUrl,
  filterSheetIssues,
  shouldReloadAfterBootstrap,
  shouldRetryAfterRecovery,
} from "@/components/spreadsheet/spreadsheet-health-helpers";
import {
  categoriesEqual,
  createBlankCategory,
  type CategoryDraft,
} from "./category-helpers";

const AUTOSAVE_DELAY_MS = 800;

type LoadState = "idle" | "loading" | "error" | "ready";
type SaveState = "idle" | "saving";

type SerializableCategory = {
  categoryId: string;
  label: string;
  color: string;
  description: string;
  sortOrder: number;
};

function normalizeDraftsFromResponse(
  source: Array<Record<string, unknown>>,
): CategoryDraft[] {
  const normalized = source
    .map((item) => ({
      categoryId: String(item.categoryId ?? "").trim(),
      label: String(item.label ?? "").trim(),
      color: String(item.color ?? "").trim() || "#999999",
      description: String(item.description ?? "").trim(),
      sortOrder:
        typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
          ? item.sortOrder
          : 0,
    }))
    .filter((item) => item.categoryId && item.label && item.color);

  const ordered = normalized.sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.label.localeCompare(right.label);
  });

  return ordered.map((item, index) => ({
    ...item,
    sortOrder: index + 1,
  }));
}

function buildPayloadFromDrafts(drafts: CategoryDraft[]): SerializableCategory[] {
  return drafts.map((draft, index) => ({
    categoryId: draft.categoryId,
    label: draft.label.trim(),
    color: draft.color.trim() || "#999999",
    description: draft.description.trim(),
    sortOrder: index + 1,
  }));
}

function resequenceDrafts(list: CategoryDraft[]): CategoryDraft[] {
  return list.map((item, index) => ({ ...item, sortOrder: index + 1 }));
}

export function CategoryManager() {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [original, setOriginal] = useState<CategoryDraft[]>([]);
  const [drafts, setDrafts] = useState<CategoryDraft[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const pendingSaveTimeoutRef = useRef<number | null>(null);
  const dragSourceIdRef = useRef<string | null>(null);
  const previousHealthBlockedRef = useRef<boolean>(false);
  const manifestStoredAt = manifest?.storedAt ?? null;
  const previousManifestStoredAtRef = useRef<number | null>(manifestStoredAt);
  const skipNextManifestReloadRef = useRef(false);

  const { diagnostics: healthDiagnostics } = useSpreadsheetHealth();
  const categoriesHealth = useMemo(
    () =>
      filterSheetIssues(healthDiagnostics, {
        sheetId: "categories",
        fallbackTitle: "Categories",
      }),
    [healthDiagnostics],
  );
  const isHealthBlocked = categoriesHealth.hasErrors;

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

  const spreadsheetId = manifest?.spreadsheetId ?? null;
  const categoriesSheetUrl = useMemo(
    () => buildSheetUrl(spreadsheetId, categoriesHealth.sheetGid),
    [categoriesHealth.sheetGid, spreadsheetId],
  );

  const isDirty = useMemo(() => !categoriesEqual(drafts, original), [drafts, original]);
  const hasIncompleteDraft = useMemo(
    () =>
      drafts.some((draft) => !draft.label.trim() || !draft.color.trim()),
    [drafts],
  );
  const isSaving = saveState === "saving";

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

        const source = Array.isArray(payload?.categories) ? payload.categories : [];
        const normalized = normalizeDraftsFromResponse(
          source.filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === "object"),
        );

        setOriginal(normalized.map((item) => ({ ...item })));
        setDrafts(normalized);
        setLoadState("ready");
        setLastSavedAt(null);
        setSaveError(null);

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
  }, [fetchCategories, spreadsheetId]);

  useEffect(() => {
    const previousStoredAt = previousManifestStoredAtRef.current;
    previousManifestStoredAtRef.current = manifestStoredAt;

    if (!spreadsheetId) {
      return;
    }

    if (shouldReloadAfterBootstrap(previousStoredAt, manifestStoredAt)) {
      if (skipNextManifestReloadRef.current) {
        skipNextManifestReloadRef.current = false;
        return;
      }
      void fetchCategories(spreadsheetId);
    }
  }, [fetchCategories, manifestStoredAt, spreadsheetId]);

  useEffect(() => {
    const previousBlocked = previousHealthBlockedRef.current;
    previousHealthBlockedRef.current = isHealthBlocked;

    if (!spreadsheetId) {
      return;
    }

    if (shouldRetryAfterRecovery(previousBlocked, isHealthBlocked)) {
      void fetchCategories(spreadsheetId);
    }
  }, [fetchCategories, isHealthBlocked, spreadsheetId]);

  const persistDrafts = useCallback(
    async (payloadCategories: SerializableCategory[]) => {
      if (!spreadsheetId) {
        return;
      }

      setSaveError(null);
      setSaveState("saving");

      try {
        const response = await fetch(
          `/api/categories?spreadsheetId=${encodeURIComponent(spreadsheetId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categories: payloadCategories }),
          },
        );

        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = typeof body?.error === "string" ? body.error : "Failed to save categories";
          throw new Error(message);
        }

        const updatedSource = Array.isArray(body?.categories)
          ? body.categories
          : (payloadCategories as unknown as Array<Record<string, unknown>>);
        const normalized = normalizeDraftsFromResponse(
          updatedSource.filter((item: unknown): item is Record<string, unknown> =>
            !!item && typeof item === "object",
          ),
        );

        setOriginal(normalized.map((item) => ({ ...item })));
        setDrafts(normalized);
        setLastSavedAt(new Date().toISOString());

        if (typeof window !== "undefined") {
          skipNextManifestReloadRef.current = true;
          const manifestRecord = saveManifest(window.localStorage, {
            spreadsheetId,
            storedAt: Date.now(),
          });
          emitManifestChange(manifestRecord);
        }

        void debugLog("Saved categories", { count: normalized.length });
      } catch (saveException) {
        const message =
          saveException instanceof Error ? saveException.message : "Failed to save categories";
        setSaveError(message);
        void debugLog("Category save error", { message });
      } finally {
        setSaveState("idle");
      }
    },
    [spreadsheetId],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (
      !spreadsheetId ||
      isHealthBlocked ||
      !isDirty ||
      loadState !== "ready" ||
      isSaving ||
      hasIncompleteDraft
    ) {
      return;
    }

    const payload = buildPayloadFromDrafts(drafts);

    const timeoutId = window.setTimeout(() => {
      void persistDrafts(payload);
    }, AUTOSAVE_DELAY_MS);
    pendingSaveTimeoutRef.current = timeoutId;

    return () => {
      window.clearTimeout(timeoutId);
      pendingSaveTimeoutRef.current = null;
    };
  }, [drafts, hasIncompleteDraft, isDirty, isHealthBlocked, isSaving, loadState, persistDrafts, spreadsheetId]);

  const handleAdd = useCallback(() => {
    if (isHealthBlocked) {
      return;
    }

    setDrafts((current) => {
      const nextSort = current.length > 0 ? Math.max(...current.map((item) => item.sortOrder)) + 1 : 1;
      return [...current, createBlankCategory(nextSort)];
    });
  }, [isHealthBlocked]);

  const handleDelete = useCallback(
    (categoryId: string) => {
      if (isHealthBlocked) {
        return;
      }

      setDrafts((current) => {
        const filtered = current.filter((item) => item.categoryId !== categoryId);
        return resequenceDrafts(filtered);
      });
    },
    [isHealthBlocked],
  );

  const handleFieldChange = useCallback(
    (categoryId: string, field: "label" | "color" | "description", value: string) => {
      if (isHealthBlocked) {
        return;
      }

      setDrafts((current) =>
        current.map((item) => {
          if (item.categoryId !== categoryId) {
            return item;
          }

          if (field === "label") {
            return { ...item, label: value };
          }

          if (field === "color") {
            return { ...item, color: value };
          }

          return { ...item, description: value };
        }),
      );
    },
    [isHealthBlocked],
  );

  const handleReset = useCallback(() => {
    if (isHealthBlocked) {
      return;
    }

    setDrafts(original.map((item) => ({ ...item })));
    setSaveError(null);
    setLastSavedAt(null);
  }, [isHealthBlocked, original]);

  const handleRefresh = useCallback(() => {
    if (spreadsheetId) {
      void fetchCategories(spreadsheetId);
    }
  }, [fetchCategories, spreadsheetId]);

  const handleManifestRefresh = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = loadManifest(window.localStorage);
    setManifest(stored);
    void debugLog("Category manager refreshed manifest", stored);
  }, []);

  const handleDragStart = useCallback((categoryId: string, event: DragEvent<HTMLButtonElement>) => {
    dragSourceIdRef.current = categoryId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", categoryId);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragSourceIdRef.current = null;
  }, []);

  const handleRowDrop = useCallback(
    (targetId: string) => {
      const sourceId = dragSourceIdRef.current;
      dragSourceIdRef.current = null;

      if (!sourceId || sourceId === targetId) {
        return;
      }

      setDrafts((current) => {
        const sourceIndex = current.findIndex((item) => item.categoryId === sourceId);
        const targetIndex = current.findIndex((item) => item.categoryId === targetId);

        if (sourceIndex === -1 || targetIndex === -1) {
          return current;
        }

        const reordered = current.slice();
        const [moved] = reordered.splice(sourceIndex, 1);
        reordered.splice(targetIndex, 0, moved);

        return resequenceDrafts(reordered);
      });
    },
    [],
  );

  const handleListDrop = useCallback(() => {
    const sourceId = dragSourceIdRef.current;
    dragSourceIdRef.current = null;

    if (!sourceId) {
      return;
    }

    setDrafts((current) => {
      const sourceIndex = current.findIndex((item) => item.categoryId === sourceId);

      if (sourceIndex === -1) {
        return current;
      }

      const reordered = current.slice();
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.push(moved);

      return resequenceDrafts(reordered);
    });
  }, []);

  const autoSaveStatus = useMemo(() => {
    if (hasIncompleteDraft) {
      return "Fill required fields to save";
    }

    if (isSaving) {
      return "Saving…";
    }

    if (isDirty) {
      return "Unsaved changes";
    }

    if (lastSavedAt) {
      return `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`;
    }

    return "All changes saved";
  }, [hasIncompleteDraft, isDirty, isSaving, lastSavedAt]);

  const blockingMessage = useMemo(() => {
    if (isHealthBlocked) {
      return "Spreadsheet health detected issues with the categories tab. Review the health panel above, repair the sheet in Google Sheets, then reload.";
    }

    if (loadState === "error" && loadError) {
      return loadError;
    }

    if (loadState === "error") {
      return "Categories are temporarily unavailable. Try reloading after fixing the spreadsheet.";
    }

    return null;
  }, [isHealthBlocked, loadError, loadState]);

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

    if (loadState === "error" || isHealthBlocked) {
      return null;
    }

    if (drafts.length === 0) {
      return (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed accent-border accent-surface p-6 text-sm dark:bg-[color:color-mix(in_srgb,var(--color-accent)_22%,#0a0a0a_78%)] dark:text-[color:var(--color-accent-muted-foreground)]">
          <p className="font-medium">No categories yet. Add your first category to start planning budgets.</p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={isHealthBlocked}
            className="inline-flex items-center rounded-md accent-bg px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:accent-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add category
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-lg border border-zinc-200/70 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60">
          <table className="min-w-full divide-y divide-zinc-200/60 dark:divide-zinc-700/60">
            <thead className="bg-zinc-50/80 dark:bg-zinc-900/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <th className="w-10 px-3 py-2">Move</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Color</th>
                <th className="px-3 py-2">Description</th>
                <th className="w-16 px-3 py-2 text-right">Order</th>
                <th className="w-24 px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody
              className="divide-y divide-zinc-100/70 bg-white/80 text-sm dark:divide-zinc-800 dark:bg-zinc-900/70"
              onDragOver={(event) => {
                if (event.target === event.currentTarget) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleListDrop();
              }}
            >
              {drafts.map((category, index) => (
                <tr
                  key={category.categoryId}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleRowDrop(category.categoryId);
                  }}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => handleDragStart(category.categoryId, event)}
                      onDragEnd={handleDragEnd}
                      aria-label={`Reorder ${category.label || "category"}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300/70 bg-white text-lg text-zinc-500 shadow-sm transition hover:bg-zinc-100 active:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      disabled={isHealthBlocked}
                    >
                      ☰
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={category.label}
                      onChange={(event) => handleFieldChange(category.categoryId, "label", event.target.value)}
                      placeholder="Category name"
                      disabled={isHealthBlocked}
                      className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={category.color}
                      onChange={(event) => handleFieldChange(category.categoryId, "color", event.target.value)}
                      placeholder="#RRGGBB"
                      disabled={isHealthBlocked}
                      className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <textarea
                      value={category.description}
                      onChange={(event) => handleFieldChange(category.categoryId, "description", event.target.value)}
                      placeholder="Optional details"
                      rows={1}
                      disabled={isHealthBlocked}
                      className="h-16 w-full resize-none rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-sm text-zinc-500 dark:text-zinc-300">{index + 1}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(category.categoryId)}
                      disabled={isHealthBlocked}
                      className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
            Edit category names, colors, descriptions, and ordering. Changes save automatically.
          </p>
        </div>
        {categoriesSheetUrl ? (
          <a
            href={categoriesSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Open in Google Sheets
          </a>
        ) : null}
      </div>

      {blockingMessage ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
          <p>{blockingMessage}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={spreadsheetId ? () => void fetchCategories(spreadsheetId) : undefined}
              disabled={!spreadsheetId}
              className="inline-flex items-center rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reload categories
            </button>
            {categoriesSheetUrl ? (
              <a
                href={categoriesSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-rose-300/60 bg-transparent px-4 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-600/60 dark:text-rose-100 dark:hover:bg-rose-900/40"
              >
                Open in Google Sheets
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {!blockingMessage ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isHealthBlocked}
              className="inline-flex items-center rounded-md accent-bg px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:accent-bg-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add category
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isSaving}
              className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty || isSaving}
              className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Undo changes
            </button>
          </div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-300">{autoSaveStatus}</span>
        </div>
      ) : null}

      {saveError && loadState !== "error" && !isHealthBlocked ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
          {saveError}
        </div>
      ) : null}

      {renderBody()}
    </section>
  );
}
