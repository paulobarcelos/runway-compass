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
import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import {
  buildSheetUrl,
  filterSheetIssues,
  shouldReloadAfterBootstrap,
  shouldRetryAfterRecovery,
} from "@/components/spreadsheet/spreadsheet-health-helpers";
import { formatMutationError } from "@/lib/query";
import { useOfflineMutationQueue } from "@/lib/query/offline-mutation-queue";
import {
  categoriesEqual,
  createBlankCategory,
  resequenceDrafts,
  type CategoryDraft,
} from "./category-helpers";
import { useCategories } from "./use-categories";

const AUTOSAVE_DELAY_MS = 800;

type LoadState = "idle" | "loading" | "error" | "ready";

export function CategoryManager() {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
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

  const { query, mutation, mutationError, invalidate } = useCategories(spreadsheetId);
  const offlineQueue = useOfflineMutationQueue(mutation, {
    onReconnect: invalidate,
    resetKey: spreadsheetId ?? null,
  });

  const loadState = useMemo<LoadState>(() => {
    if (!spreadsheetId) {
      return "idle";
    }

    if (query.isLoading || query.status === "pending") {
      return "loading";
    }

    if (query.isError) {
      return "error";
    }

    if (Array.isArray(query.data)) {
      return "ready";
    }

    return "idle";
  }, [query.data, query.isError, query.isLoading, query.status, spreadsheetId]);

  const loadError = useMemo(() => {
    if (!query.isError) {
      return null;
    }

    return formatMutationError(query.error);
  }, [query.error, query.isError]);

  const isDirty = useMemo(() => !categoriesEqual(drafts, original), [drafts, original]);
  const hasIncompleteDraft = useMemo(
    () => drafts.some((draft) => !draft.label.trim()),
    [drafts],
  );
  const combinedSaveError = saveError ?? mutationError ?? null;


  useEffect(() => {
    if (!spreadsheetId) {
      setOriginal([]);
      setDrafts([]);
      setLastSavedAt(null);
      setSaveError(null);
      return;
    }

    if (!Array.isArray(query.data)) {
      return;
    }

    const normalized = resequenceDrafts(query.data.map((item) => ({ ...item })));

    setOriginal((current) =>
      categoriesEqual(current, normalized) ? current : normalized.map((item) => ({ ...item })),
    );

    if (!isDirty) {
      setDrafts(normalized.map((item) => ({ ...item })));
    }
  }, [isDirty, query.data, spreadsheetId]);

  useEffect(() => {
    if (!spreadsheetId || !mutation.isSuccess || !Array.isArray(mutation.data)) {
      return;
    }

    const normalized = resequenceDrafts(mutation.data.map((item) => ({ ...item })));
    setOriginal(normalized.map((item) => ({ ...item })));
    setDrafts(normalized);
    setLastSavedAt(new Date().toISOString());
    setSaveError(null);

    if (typeof window !== "undefined") {
      skipNextManifestReloadRef.current = true;
      const record = saveManifest(window.localStorage, {
        spreadsheetId,
        storedAt: Date.now(),
      });
      emitManifestChange(record);
    }
  }, [mutation.data, mutation.isSuccess, spreadsheetId]);

  useEffect(() => {
    if (!spreadsheetId) {
      return;
    }

    const previousBlocked = previousHealthBlockedRef.current;
    previousHealthBlockedRef.current = isHealthBlocked;

    if (shouldRetryAfterRecovery(previousBlocked, isHealthBlocked)) {
      void query.refetch();
    }
  }, [isHealthBlocked, query, spreadsheetId]);

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

      void query.refetch();
    }
  }, [manifestStoredAt, query, spreadsheetId]);

  const persistDrafts = useCallback(
    async (nextDrafts: CategoryDraft[]) => {
      if (!spreadsheetId) {
        return;
      }

      mutation.reset();
      setSaveError(null);

      try {
        const queuedWhileOffline = !offlineQueue.isOnline;

        if (queuedWhileOffline) {
          setSaveError("Offline: changes will sync when reconnected.");
        }

        await offlineQueue.enqueue(resequenceDrafts(nextDrafts));
      } catch (error) {
        const message = formatMutationError(error);
        setSaveError(message);
        console.error("Category save error", message);
      }
    },
    [mutation, offlineQueue, spreadsheetId],
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
      mutation.isPending ||
      hasIncompleteDraft
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistDrafts(drafts);
    }, AUTOSAVE_DELAY_MS);
    pendingSaveTimeoutRef.current = timeoutId;

    return () => {
      window.clearTimeout(timeoutId);
      pendingSaveTimeoutRef.current = null;
    };
  }, [drafts, hasIncompleteDraft, isDirty, isHealthBlocked, loadState, mutation.isPending, persistDrafts, spreadsheetId]);

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

  const handleRefresh = useCallback(() => {
    if (!spreadsheetId) {
      return;
    }

    mutation.reset();
    setSaveError(null);
    void query.refetch();
  }, [mutation, query, spreadsheetId]);

  const handleManifestRefresh = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = loadManifest(window.localStorage);
    setManifest(stored);
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
    if (!offlineQueue.isOnline) {
      return "Offline – changes will sync when online";
    }

    if (offlineQueue.pending > 0) {
      return "Changes will sync when online";
    }

    if (hasIncompleteDraft) {
      return "Fill required fields to save";
    }

    if (mutation.isPending) {
      return "Saving…";
    }

    if (isDirty) {
      return "Unsaved changes";
    }

    if (lastSavedAt) {
      return `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`;
    }

    return "All changes saved";
  }, [hasIncompleteDraft, isDirty, lastSavedAt, mutation.isPending, offlineQueue.isOnline, offlineQueue.pending]);

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
        <div className="rounded-lg border border-dashed border-zinc-300/70 bg-zinc-50/60 p-6 text-sm text-zinc-600 dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-300">
          Loading categories…
        </div>
      );
    }

    if (blockingMessage) {
      return null;
    }

    if (drafts.length === 0) {
      return (
        <div className="rounded-lg border border-zinc-200/70 bg-white/60 p-6 text-sm text-zinc-600 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-300">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">No categories yet.</p>
          <p className="mt-2 text-sm">Add a category to plan your budget categories and colors.</p>
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-lg border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700/60">
          <thead className="bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60 dark:text-zinc-400">
            <tr>
              <th scope="col" className="w-10 px-3 py-3" aria-label="Reorder" />
              <th scope="col" className="px-3 py-3 text-left">Label</th>
              <th scope="col" className="px-3 py-3 text-left">Color</th>
              <th scope="col" className="px-3 py-3 text-left">Description</th>
              <th scope="col" className="px-3 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody
            className="divide-y divide-zinc-200/70 text-sm dark:divide-zinc-700/60"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleListDrop}
          >
            {drafts.map((category) => (
              <tr
                key={category.categoryId}
                className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleRowDrop(category.categoryId);
                }}
              >
                <td className="w-10 px-3 py-2">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleDragStart(category.categoryId, event)}
                    onDragEnd={handleDragEnd}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200/70 bg-white text-lg leading-none text-zinc-400 shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:focus:ring-zinc-600"
                    aria-label="Reorder category"
                  >
                    ⋮⋮
                  </button>
                </td>
                <td className="w-1/4 px-3 py-2">
                  <input
                    value={category.label}
                    onChange={(event) => handleFieldChange(category.categoryId, "label", event.target.value)}
                    placeholder="Category name"
                    disabled={isHealthBlocked}
                    className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </td>
                <td className="w-28 px-3 py-2">
                  <input
                    value={category.color}
                    onChange={(event) => handleFieldChange(category.categoryId, "color", event.target.value)}
                    placeholder="#000000"
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
                <td className="w-20 px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleDelete(category.categoryId)}
                    disabled={isHealthBlocked}
                    className="inline-flex items-center rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Categories</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Define the categories that power your budget, projections, and reporting.
          </p>
        </div>
        {categoriesSheetUrl ? (
          <a
            href={categoriesSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-zinc-200/70 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Open sheet
          </a>
        ) : null}
      </header>

      {blockingMessage ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
          {blockingMessage}
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
              disabled={mutation.isPending}
              className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Refresh
            </button>
          </div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-300">{autoSaveStatus}</span>
        </div>
      ) : null}

      {combinedSaveError && loadState !== "error" && !isHealthBlocked ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
          {combinedSaveError}
        </div>
      ) : null}

      {renderBody()}
    </section>
  );
}
