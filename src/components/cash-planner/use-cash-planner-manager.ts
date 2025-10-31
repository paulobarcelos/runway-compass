// ABOUTME: Manages ledger entries for the simplified cash planner table.
// ABOUTME: Loads rows, exposes CRUD helpers, and triggers projection refresh.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCashFlows as fetchCashFlowsFromApi,
  createCashFlow as createCashFlowToApi,
  updateCashFlow as updateCashFlowToApi,
  deleteCashFlow as deleteCashFlowToApi,
} from "@/lib/api/cash-flows-client";
import { refreshRunwayProjection as refreshRunwayProjectionToApi } from "@/lib/api/runway-client";
import { emitRunwayProjectionUpdated } from "@/lib/api/runway-refresh-events";
import type {
  CashFlowDraft,
  CashFlowEntry,
  CashFlowRecord,
} from "@/server/google/repository/cash-flow-repository";

export type CashPlannerManagerStatus = "idle" | "loading" | "ready" | "error" | "blocked";

export interface CashPlannerManagerState {
  status: CashPlannerManagerStatus;
  blockingMessage: string | null;
  error: string | null;
  entries: CashFlowRecord[];
  isSaving: boolean;
  reload: () => Promise<void>;
  createEntry: (draft: CashFlowDraft) => Promise<CashFlowRecord | null>;
  updateEntry: (flowId: string, updates: Partial<CashFlowEntry>) => Promise<CashFlowRecord | null>;
  deleteEntry: (flowId: string) => Promise<void>;
}

interface FetchCashFlowsOptions {
  spreadsheetId: string;
}

type FetchCashFlows = (options: FetchCashFlowsOptions) => Promise<CashFlowRecord[]>;

type CreateCashFlow = (options: {
  spreadsheetId: string;
  draft: CashFlowDraft;
}) => Promise<CashFlowEntry>;

type UpdateCashFlow = (options: {
  spreadsheetId: string;
  flowId: string;
  updates: Partial<CashFlowEntry>;
}) => Promise<CashFlowEntry | null>;

type DeleteCashFlow = (options: {
  spreadsheetId: string;
  flowId: string;
}) => Promise<void>;

type RefreshRunwayProjection = (options: {
  spreadsheetId: string;
}) => Promise<{ updatedAt: string | null; rowsWritten: number }>;

const defaultFetchCashFlows: FetchCashFlows = ({ spreadsheetId }) =>
  fetchCashFlowsFromApi(spreadsheetId);

const defaultCreateCashFlow: CreateCashFlow = ({ spreadsheetId, draft }) =>
  createCashFlowToApi(spreadsheetId, draft);

const defaultUpdateCashFlow: UpdateCashFlow = ({ spreadsheetId, flowId, updates }) =>
  updateCashFlowToApi(spreadsheetId, flowId, updates);

const defaultDeleteCashFlow: DeleteCashFlow = ({ spreadsheetId, flowId }) =>
  deleteCashFlowToApi(spreadsheetId, flowId);

const defaultRefreshRunwayProjection: RefreshRunwayProjection = ({ spreadsheetId }) =>
  refreshRunwayProjectionToApi(spreadsheetId);

function cloneEntries(entries: CashFlowRecord[]) {
  return entries.map((entry) => ({ ...entry }));
}

export function useCashPlannerManager({
  spreadsheetId: spreadsheetIdProp = null,
  fetchCashFlows = defaultFetchCashFlows,
  createCashFlow = defaultCreateCashFlow,
  updateCashFlow = defaultUpdateCashFlow,
  deleteCashFlow = defaultDeleteCashFlow,
  refreshRunwayProjection = defaultRefreshRunwayProjection,
  disabled = false,
  disabledMessage,
}: {
  spreadsheetId?: string | null;
  fetchCashFlows?: FetchCashFlows;
  createCashFlow?: CreateCashFlow;
  updateCashFlow?: UpdateCashFlow;
  deleteCashFlow?: DeleteCashFlow;
  refreshRunwayProjection?: RefreshRunwayProjection;
  disabled?: boolean;
  disabledMessage?: string | null;
} = {}): CashPlannerManagerState {
  const spreadsheetId = spreadsheetIdProp?.trim() || null;

  const fetchRef = useRef(fetchCashFlows);
  const createRef = useRef(createCashFlow);
  const updateRef = useRef(updateCashFlow);
  const deleteRef = useRef(deleteCashFlow);
  const refreshRef = useRef(refreshRunwayProjection);

  fetchRef.current = fetchCashFlows;
  createRef.current = createCashFlow;
  updateRef.current = updateCashFlow;
  deleteRef.current = deleteCashFlow;
  refreshRef.current = refreshRunwayProjection;

  const [status, setStatus] = useState<CashPlannerManagerStatus>(() => {
    if (disabled) {
      return "blocked";
    }

    return spreadsheetId ? "loading" : "blocked";
  });
  const [blockingMessage, setBlockingMessage] = useState<string | null>(
    disabled
      ? disabledMessage ?? "Ledger tab is disabled by spreadsheet health diagnostics."
      : spreadsheetId
      ? null
      : "Connect a spreadsheet to manage ledger entries.",
  );
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<CashFlowRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const loadCashFlows = useCallback(
    async (options?: { skipStatusReset?: boolean; cancelCheck?: () => boolean }) => {
      if (!spreadsheetId || disabled) {
        setStatus("blocked");
        setBlockingMessage(
          disabled && disabledMessage
            ? disabledMessage
            : "Connect a spreadsheet to manage ledger entries.",
        );
        setError(null);
        setEntries([]);
        return;
      }

      if (!options?.skipStatusReset) {
        setStatus("loading");
        setBlockingMessage(null);
        setError(null);
      }

      try {
        const result = await fetchRef.current({ spreadsheetId });

        if (options?.cancelCheck?.()) {
          return;
        }

        setEntries(cloneEntries(result));
        setStatus("ready");
      } catch (err) {
        if (options?.cancelCheck?.()) {
          return;
        }

        const message = err instanceof Error ? err.message : "Failed to load ledger entries";
        setError(message);
        setEntries([]);
        setStatus("error");
      }
    },
    [disabled, disabledMessage, spreadsheetId],
  );

  useEffect(() => {
    if (!spreadsheetId || disabled) {
      setEntries([]);
      return;
    }

    let cancelled = false;

    void loadCashFlows({
      cancelCheck: () => cancelled,
    });

    return () => {
      cancelled = true;
    };
  }, [disabled, spreadsheetId, loadCashFlows]);

  const reload = useCallback(async () => {
    await loadCashFlows();
  }, [loadCashFlows]);

  const triggerProjectionRefresh = useCallback(
    async (shouldEmit: boolean) => {
      if (!spreadsheetId) {
        return;
      }

      try {
        const result = await refreshRef.current({ spreadsheetId });
        if (shouldEmit) {
          emitRunwayProjectionUpdated({
            spreadsheetId,
            updatedAt: result.updatedAt,
            rowsWritten: result.rowsWritten,
          });
        }
      } catch {
        // Ignore projection refresh failures; the UI can retry manually later.
      }
    },
    [spreadsheetId],
  );

  const createEntry = useCallback(
    async (draft: CashFlowDraft) => {
      if (!spreadsheetId) {
        return null;
      }

      setIsSaving(true);
      try {
        const created = await createRef.current({ spreadsheetId, draft });
        setEntries((current) => [...current, { ...created }]);
        void triggerProjectionRefresh(true);
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create ledger entry");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [spreadsheetId, triggerProjectionRefresh],
  );

  const updateEntry = useCallback(
    async (flowId: string, updates: Partial<CashFlowEntry>) => {
      if (!spreadsheetId) {
        return null;
      }

      setIsSaving(true);
      try {
        const updated = await updateRef.current({ spreadsheetId, flowId, updates });

        if (!updated) {
          return null;
        }

        setEntries((current) =>
          current.map((entry) => (entry.flowId === flowId ? { ...updated } : entry)),
        );
        void triggerProjectionRefresh(true);
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update ledger entry");
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [spreadsheetId, triggerProjectionRefresh],
  );

  const deleteEntry = useCallback(
    async (flowId: string) => {
      if (!spreadsheetId) {
        return;
      }

      setIsSaving(true);
      try {
        await deleteRef.current({ spreadsheetId, flowId });
        setEntries((current) => current.filter((entry) => entry.flowId !== flowId));
        void triggerProjectionRefresh(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete ledger entry");
      } finally {
        setIsSaving(false);
      }
    },
    [spreadsheetId, triggerProjectionRefresh],
  );

  return useMemo(
    () => ({
      status,
      blockingMessage,
      error,
      entries,
      isSaving,
      reload,
      createEntry,
      updateEntry,
      deleteEntry,
    }),
    [status, blockingMessage, error, entries, isSaving, reload, createEntry, updateEntry, deleteEntry],
  );
}
