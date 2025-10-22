// ABOUTME: Provides spreadsheet diagnostics state sourced from the health API.
// ABOUTME: Supplies shared warnings, errors, and reload capability to managers.
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { debugLog } from "@/lib/debug-log";
import {
  loadManifest,
  manifestStorageKey,
  type ManifestRecord,
} from "@/lib/manifest-store";
import { subscribeToManifestChange } from "@/lib/manifest-events";
import {
  flattenSpreadsheetIssues,
  type SpreadsheetDiagnosticsPayload,
  type SpreadsheetIssue,
} from "./spreadsheet-health-helpers";

type HealthStatus = "idle" | "loading" | "ready" | "error";

interface StoredDiagnostics {
  warnings: Record<string, unknown>[];
  errors: Record<string, unknown>[];
}

interface SpreadsheetHealthContextValue {
  spreadsheetId: string | null;
  status: HealthStatus;
  diagnostics: StoredDiagnostics;
  issues: SpreadsheetIssue[];
  error: string | null;
  lastFetchedAt: number | null;
  isFetching: boolean;
  reload: () => Promise<void>;
}

const SpreadsheetHealthContext = createContext<SpreadsheetHealthContextValue | null>(null);

function createEmptyDiagnostics(): StoredDiagnostics {
  return { warnings: [], errors: [] };
}

interface CacheEntry {
  diagnostics: StoredDiagnostics;
  fetchedAt: number;
}

export function SpreadsheetHealthProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
  const [status, setStatus] = useState<HealthStatus>("idle");
  const [diagnostics, setDiagnostics] = useState<StoredDiagnostics>(createEmptyDiagnostics());
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateManifest = () => {
      const stored = loadManifest(window.localStorage);
      setManifest(stored);
    };

    updateManifest();
    void debugLog("Spreadsheet health loaded manifest", loadManifest(window.localStorage));

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

  const fetchHealth = useCallback(
    async (id: string, { force }: { force?: boolean } = {}) => {
      const cached = cacheRef.current.get(id);

      if (cached && !force) {
        setDiagnostics(cached.diagnostics);
        setStatus("ready");
        setError(null);
        setLastFetchedAt(cached.fetchedAt);
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsFetching(true);
      setError(null);

      if (!cached) {
        setStatus("loading");
        setDiagnostics(createEmptyDiagnostics());
        setLastFetchedAt(null);
      }

      try {
        const response = await fetch(
          `/api/spreadsheet/health?spreadsheetId=${encodeURIComponent(id)}`,
          {
            signal: controller.signal,
            headers: {
              Accept: "application/json",
            },
          },
        );

        const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

        if (!response.ok) {
          const message =
            typeof body?.error === "string" ? body.error : "Failed to load spreadsheet health";
          throw new Error(message);
        }

        const payload = body?.diagnostics as SpreadsheetDiagnosticsPayload | undefined;

        const warnings = Array.isArray(payload?.warnings)
          ? payload.warnings.map((item) => (item && typeof item === "object" ? { ...item } : {}))
          : [];
        const errors = Array.isArray(payload?.errors)
          ? payload.errors.map((item) => (item && typeof item === "object" ? { ...item } : {}))
          : [];

        const normalized: StoredDiagnostics = { warnings, errors };
        const fetchedAt = Date.now();

        cacheRef.current.set(id, { diagnostics: normalized, fetchedAt });
        setDiagnostics(normalized);
        setStatus("ready");
        setLastFetchedAt(fetchedAt);
        setError(null);
        void debugLog("Spreadsheet health fetched diagnostics", {
          spreadsheetId: id,
          warnings: warnings.length,
          errors: errors.length,
        });
      } catch (fetchError) {
        if ((fetchError as Error).name === "AbortError") {
          return;
        }

        const message =
          fetchError instanceof Error ? fetchError.message : "Failed to load spreadsheet health";

        setError(message);
        setStatus(cacheRef.current.has(id) ? "ready" : "error");

        void debugLog("Spreadsheet health request failed", { message });
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }

        setIsFetching(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!spreadsheetId) {
      setDiagnostics(createEmptyDiagnostics());
      setStatus("idle");
      setError(null);
      setLastFetchedAt(null);
      return;
    }

    const cached = cacheRef.current.get(spreadsheetId);

    if (cached) {
      setDiagnostics(cached.diagnostics);
      setStatus("ready");
      setError(null);
      setLastFetchedAt(cached.fetchedAt);
    } else {
      setStatus("loading");
      setDiagnostics(createEmptyDiagnostics());
      setError(null);
      setLastFetchedAt(null);
    }

    void fetchHealth(spreadsheetId, { force: !cached });

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [spreadsheetId, fetchHealth]);

  const issues = useMemo(() => flattenSpreadsheetIssues(diagnostics), [diagnostics]);

  const value = useMemo<SpreadsheetHealthContextValue>(
    () => ({
      spreadsheetId,
      status,
      diagnostics,
      issues,
      error,
      lastFetchedAt,
      isFetching,
      reload: async () => {
        if (!spreadsheetId) {
          return;
        }

        await fetchHealth(spreadsheetId, { force: true });
      },
    }),
    [diagnostics, error, fetchHealth, isFetching, issues, lastFetchedAt, spreadsheetId, status],
  );

  return (
    <SpreadsheetHealthContext.Provider value={value}>
      {children}
    </SpreadsheetHealthContext.Provider>
  );
}

export function useSpreadsheetHealth() {
  const context = useContext(SpreadsheetHealthContext);

  if (!context) {
    throw new Error("useSpreadsheetHealth must be used within a SpreadsheetHealthProvider");
  }

  return context;
}
