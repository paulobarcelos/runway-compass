// ABOUTME: Wraps cash flows API calls with error normalization.
// ABOUTME: Exposes helpers for fetching and saving ledger entries from the client.
import type {
  CashFlowDraft,
  CashFlowEntry,
  CashFlowRecord,
} from "@/server/google/repository/cash-flow-repository";

const FETCH_ERROR_MESSAGE = "Failed to fetch cash flows";
const CREATE_ERROR_MESSAGE = "Failed to create cash flow";
const UPDATE_ERROR_MESSAGE = "Failed to update cash flow";
const DELETE_ERROR_MESSAGE = "Failed to delete cash flow";

export class CashFlowsClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "CashFlowsClientError";
    this.status = status;
  }
}

function ensureSpreadsheetId(value: string) {
  if (!value || !value.trim()) {
    throw new Error("Missing spreadsheetId");
  }

  return value.trim();
}

async function parseFlowsPayload(response: Response, defaultMessage: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    flows?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    const message =
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : defaultMessage;

    throw new CashFlowsClientError(response.status, message);
  }

  const records = Array.isArray(payload?.flows) ? payload.flows : [];

  return records as CashFlowRecord[];
}

async function parseFlowPayload(response: Response, defaultMessage: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    flow?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    const message =
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : defaultMessage;

    throw new CashFlowsClientError(response.status, message);
  }

  if (!payload?.flow || typeof payload.flow !== "object") {
    throw new CashFlowsClientError(response.status, defaultMessage);
  }

  return payload.flow as CashFlowEntry;
}

export async function fetchCashFlows(spreadsheetId: string): Promise<CashFlowRecord[]> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/cash-flows?spreadsheetId=${encodeURIComponent(normalizedId)}`,
  );

  return parseFlowsPayload(response, FETCH_ERROR_MESSAGE);
}

export async function createCashFlow(
  spreadsheetId: string,
  draft: CashFlowDraft,
): Promise<CashFlowEntry> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/cash-flows?spreadsheetId=${encodeURIComponent(normalizedId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ flow: draft }),
    },
  );

  return parseFlowPayload(response, CREATE_ERROR_MESSAGE);
}

export async function updateCashFlow(
  spreadsheetId: string,
  flowId: string,
  updates: Partial<CashFlowEntry>,
): Promise<CashFlowEntry> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/cash-flows/${encodeURIComponent(flowId)}?spreadsheetId=${encodeURIComponent(normalizedId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ updates }),
    },
  );

  return parseFlowPayload(response, UPDATE_ERROR_MESSAGE);
}

export async function deleteCashFlow(
  spreadsheetId: string,
  flowId: string,
): Promise<void> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/cash-flows/${encodeURIComponent(flowId)}?spreadsheetId=${encodeURIComponent(normalizedId)}`,
    {
      method: "DELETE",
    },
  );

  if (response.ok) {
    return;
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  const message =
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : DELETE_ERROR_MESSAGE;

  throw new CashFlowsClientError(response.status, message);
}
