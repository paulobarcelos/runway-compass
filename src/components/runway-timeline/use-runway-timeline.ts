// ABOUTME: Loads runway projection rows and maps them into display state.
// ABOUTME: Watches manifest and spreadsheet health to refresh the timeline.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBaseCurrency } from "@/components/currency/base-currency-context";
import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import { filterSheetIssues } from "@/components/spreadsheet/spreadsheet-health-helpers";
import { fetchRunwayProjection } from "@/lib/api/runway-client";
import { debugLog } from "@/lib/debug-log";
import {
  loadManifest,
  manifestStorageKey,
  type ManifestRecord,
} from "@/lib/manifest-store";
import { subscribeToManifestChange } from "@/lib/manifest-events";
import type { SpreadsheetDiagnosticsPayload } from "@/components/spreadsheet/spreadsheet-health-helpers";
import type { RunwayProjectionRecord } from "@/server/google/repository/runway-projection-repository";

const TIMELINE_SHEET_ID = "runway_projection";

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

export type RunwayTimelineStatus = "idle" | "loading" | "ready" | "blocked" | "error";

export interface RunwayTimelineRow {
  id: string;
  month: number;
  year: number;
  monthLabel: string;
  startingBalanceDisplay: string;
  incomeDisplay: string;
  expenseDisplay: string;
  endingBalanceDisplay: string;
  netChangeDisplay: string;
  endingBalanceValue: number;
  stoplightStatus: string;
  notes: string;
}

export interface RunwayTimelineState {
  status: RunwayTimelineStatus;
  blockingMessage: string | null;
  error: string | null;
  rows: RunwayTimelineRow[];
  lastUpdatedAt: string | null;
  refresh: () => Promise<void>;
}

function buildTimelineRows(
  records: RunwayProjectionRecord[],
  formatAmount: (amount: number, isApproximation?: boolean) => string,
): RunwayTimelineRow[] {
  const sorted = [...records].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }

    return left.month - right.month;
  });

  const rows: RunwayTimelineRow[] = [];

  for (const record of sorted) {
    const id = `${record.year}-${String(record.month).padStart(2, "0")}`;
    const monthLabel = monthFormatter.format(new Date(record.year, record.month - 1, 1));
    const netChange = record.endingBalance - record.startingBalance;
    const netChangeAbsolute = Math.abs(netChange);
    const netChangeFormatted = formatAmount(netChangeAbsolute);
    const netChangeDisplay =
      netChange === 0
        ? formatAmount(0)
        : netChange > 0
        ? `+${netChangeFormatted}`
        : `-${netChangeFormatted}`;

    rows.push({
      id,
      month: record.month,
      year: record.year,
      monthLabel,
      startingBalanceDisplay: formatAmount(record.startingBalance),
      incomeDisplay: formatAmount(record.incomeTotal),
      expenseDisplay: formatAmount(record.expenseTotal),
      endingBalanceDisplay: formatAmount(record.endingBalance),
      netChangeDisplay,
      endingBalanceValue: record.endingBalance,
      stoplightStatus: (record.stoplightStatus || "neutral").toLowerCase(),
      notes: (record.notes ?? "").trim(),
    });
  }

  return rows;
}

export function useRunwayTimeline(): RunwayTimelineState {
  const { formatAmount } = useBaseCurrency();
  const { diagnostics } = useSpreadsheetHealth();
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
  const [status, setStatus] = useState<RunwayTimelineStatus>("idle");
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RunwayTimelineRow[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const activeRequestRef = useRef(0);

  const spreadsheetId = manifest?.spreadsheetId ?? null;
  const storedAt = manifest?.storedAt ?? null;

  const timelineHealth = useMemo(
    () =>
      filterSheetIssues(diagnostics as SpreadsheetDiagnosticsPayload, {
        sheetId: TIMELINE_SHEET_ID,
        fallbackTitle: "Runway projection",
      }),
    [diagnostics],
  );

  const hasBlockingErrors = timelineHealth.hasErrors;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateManifest = () => {
      const stored = loadManifest(window.localStorage);
      setManifest(stored);
    };

    updateManifest();
    void debugLog("Runway timeline loaded manifest", loadManifest(window.localStorage));

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

  const loadProjection = useCallback(
    async ({ spreadsheetId: id, showLoading }: { spreadsheetId: string; showLoading: boolean }) => {
      const requestId = Date.now();
      activeRequestRef.current = requestId;

      if (showLoading) {
        setStatus("loading");
        setBlockingMessage(null);
        setError(null);
      } else {
        setError(null);
      }

      try {
        const records = await fetchRunwayProjection(id);

        if (activeRequestRef.current !== requestId) {
          return;
        }

        const timelineRows = buildTimelineRows(records, formatAmount);
        setRows(timelineRows);
        setStatus("ready");
        setBlockingMessage(null);
        setError(null);
        setLastUpdatedAt(new Date().toISOString());
        void debugLog("Runway timeline loaded", { spreadsheetId: id, rows: timelineRows.length });
      } catch (loadError) {
        if (activeRequestRef.current !== requestId) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : "Failed to load runway timeline";
        setError(message);
        setStatus("error");
        void debugLog("Runway timeline load failed", { spreadsheetId: id, message });
      }
    },
    [formatAmount],
  );

  useEffect(() => {
    if (!spreadsheetId) {
      setRows([]);
      setStatus("blocked");
      setBlockingMessage("Connect a spreadsheet to view the runway timeline.");
      setError(null);
      setLastUpdatedAt(null);
      return;
    }

    if (hasBlockingErrors) {
      setRows([]);
      setStatus("blocked");
      setBlockingMessage(
        "Spreadsheet health flagged issues with the runway projection tab. Fix the spreadsheet issues above, then reload.",
      );
      setError(null);
      setLastUpdatedAt(null);
      return;
    }

    void loadProjection({ spreadsheetId, showLoading: true });
  }, [spreadsheetId, hasBlockingErrors, storedAt, loadProjection]);

  const refresh = useCallback(async () => {
    if (!spreadsheetId || hasBlockingErrors) {
      return;
    }

    await loadProjection({ spreadsheetId, showLoading: true });
  }, [hasBlockingErrors, loadProjection, spreadsheetId]);

  return {
    status,
    blockingMessage,
    error,
    rows,
    lastUpdatedAt,
    refresh,
  };
}
