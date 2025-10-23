// ABOUTME: Manages local state for the cash planner ledger experience.
// ABOUTME: Loads cash flows, tracks edits, and persists changes back to Sheets.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchCashFlows as fetchCashFlowsFromApi,
  saveCashFlows as saveCashFlowsToApi,
} from "@/lib/api/cash-flows-client";
import type { CashFlowRecord } from "@/server/google/repository/cash-flow-repository";

export type CashPlannerManagerStatus = "idle" | "loading" | "ready" | "error" | "blocked";

export interface CashFlowDraft extends Omit<CashFlowRecord, "flowId"> {
  flowId?: string;
}

export interface CashPlannerManagerState {
  status: CashPlannerManagerStatus;
  blockingMessage: string | null;
  error: string | null;
  flows: CashFlowRecord[];
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  reload: () => Promise<void>;
  save: () => Promise<void>;
  addFlow: (draft: CashFlowDraft) => void;
  updateFlow: (flowId: string, changes: Partial<CashFlowRecord>) => void;
  removeFlow: (flowId: string) => void;
  duplicateFlow: (flowId: string) => void;
}

interface FetchCashFlowsOptions {
  spreadsheetId: string;
}

interface SaveCashFlowsOptions extends FetchCashFlowsOptions {
  flows: CashFlowRecord[];
}

type FetchCashFlows = (options: FetchCashFlowsOptions) => Promise<CashFlowRecord[]>;

type SaveCashFlows = (options: SaveCashFlowsOptions) => Promise<void>;

const defaultFetchCashFlows: FetchCashFlows = ({ spreadsheetId }) =>
  fetchCashFlowsFromApi(spreadsheetId);

const defaultSaveCashFlows: SaveCashFlows = ({ spreadsheetId, flows }) =>
  saveCashFlowsToApi(spreadsheetId, flows);

function cloneFlows(flows: CashFlowRecord[]) {
  return flows.map((flow) => ({ ...flow }));
}

function generateFlowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function serializeFlows(flows: CashFlowRecord[]) {
  return JSON.stringify(
    flows.map((flow) => ({
      ...flow,
      plannedAmount: Number(flow.plannedAmount),
      actualAmount: Number(flow.actualAmount),
    })),
  );
}

export function useCashPlannerManager({
  spreadsheetId: spreadsheetIdProp = null,
  fetchCashFlows = defaultFetchCashFlows,
  saveCashFlows = defaultSaveCashFlows,
}: {
  spreadsheetId?: string | null;
  fetchCashFlows?: FetchCashFlows;
  saveCashFlows?: SaveCashFlows;
} = {}): CashPlannerManagerState {
  const spreadsheetId = spreadsheetIdProp?.trim() || null;

  const fetchRef = useRef(fetchCashFlows);
  const saveRef = useRef(saveCashFlows);

  fetchRef.current = fetchCashFlows;
  saveRef.current = saveCashFlows;

  const [status, setStatus] = useState<CashPlannerManagerStatus>(
    spreadsheetId ? "loading" : "blocked",
  );
  const [blockingMessage, setBlockingMessage] = useState<string | null>(
    spreadsheetId ? null : "Connect a spreadsheet to manage cash flows.",
  );
  const [error, setError] = useState<string | null>(null);
  const [flows, setFlows] = useState<CashFlowRecord[]>([]);
  const [baselineFlows, setBaselineFlows] = useState<CashFlowRecord[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const loadCashFlows = useCallback(
    async (options?: { skipStatusReset?: boolean; cancelCheck?: () => boolean }) => {
      if (!spreadsheetId) {
        setStatus("blocked");
        setBlockingMessage("Connect a spreadsheet to manage cash flows.");
        setError(null);
        setFlows([]);
        setBaselineFlows([]);
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

        setFlows(cloneFlows(result));
        setBaselineFlows(cloneFlows(result));
        setStatus("ready");
      } catch (err) {
        if (options?.cancelCheck?.()) {
          return;
        }

        const message = err instanceof Error ? err.message : "Failed to load cash flows";
        setError(message);
        setFlows([]);
        setBaselineFlows([]);
        setStatus("error");
      }
    },
    [spreadsheetId],
  );

  useEffect(() => {
    let cancelled = false;

    loadCashFlows({
      cancelCheck: () => cancelled,
    });

    return () => {
      cancelled = true;
    };
  }, [loadCashFlows]);

  const reload = useCallback(async () => {
    await loadCashFlows();
  }, [loadCashFlows]);

  const save = useCallback(async () => {
    if (!spreadsheetId) {
      return;
    }

    setIsSaving(true);

    try {
      await saveRef.current({ spreadsheetId, flows });
      setBaselineFlows(cloneFlows(flows));
      setLastSavedAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save cash flows";
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [flows, spreadsheetId]);

  const addFlow = useCallback((draft: CashFlowDraft) => {
    setFlows((current) => [
      ...current,
      {
        flowId: draft.flowId?.trim() || generateFlowId(),
        type: draft.type,
        categoryId: draft.categoryId,
        plannedDate: draft.plannedDate,
        plannedAmount: draft.plannedAmount,
        actualDate: draft.actualDate,
        actualAmount: draft.actualAmount,
        status: draft.status,
        accountId: draft.accountId,
        note: draft.note,
      },
    ]);
  }, []);

  const updateFlow = useCallback((flowId: string, changes: Partial<CashFlowRecord>) => {
    setFlows((current) =>
      current.map((flow) =>
        flow.flowId === flowId
          ? {
              ...flow,
              ...changes,
            }
          : flow,
      ),
    );
  }, []);

  const removeFlow = useCallback((flowId: string) => {
    setFlows((current) => current.filter((flow) => flow.flowId !== flowId));
  }, []);

  const duplicateFlow = useCallback((flowId: string) => {
    setFlows((current) => {
      const target = current.find((flow) => flow.flowId === flowId);

      if (!target) {
        return current;
      }

      const duplicate: CashFlowRecord = {
        ...target,
        flowId: generateFlowId(),
        status: "planned",
        actualAmount: 0,
        actualDate: "",
      };

      return [...current, duplicate];
    });
  }, []);

  const flowsSignature = useMemo(() => serializeFlows(flows), [flows]);
  const baselineSignature = useMemo(() => serializeFlows(baselineFlows), [baselineFlows]);

  const isDirty = flowsSignature !== baselineSignature;

  return {
    status,
    blockingMessage,
    error,
    flows,
    isDirty,
    isSaving,
    lastSavedAt,
    reload,
    save,
    addFlow,
    updateFlow,
    removeFlow,
    duplicateFlow,
  };
}
