// ABOUTME: Wraps cash flows API calls with error normalization.
// ABOUTME: Exposes helpers for fetching and saving ledger entries from the client.
import type { CashFlowRecord } from "@/server/google/repository/cash-flow-repository";

const FETCH_ERROR_MESSAGE = "Failed to fetch cash flows";
const SAVE_ERROR_MESSAGE = "Failed to save cash flows";

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

async function ensureSuccess(response: Response, defaultMessage: string) {
  if (response.ok) {
    return;
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  const message =
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : defaultMessage;

  throw new CashFlowsClientError(response.status, message);
}

export async function fetchCashFlows(spreadsheetId: string): Promise<CashFlowRecord[]> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/cash-flows?spreadsheetId=${encodeURIComponent(normalizedId)}`,
  );

  return parseFlowsPayload(response, FETCH_ERROR_MESSAGE);
}

export async function saveCashFlows(
  spreadsheetId: string,
  flows: CashFlowRecord[],
): Promise<void> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/cash-flows?spreadsheetId=${encodeURIComponent(normalizedId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ flows }),
    },
  );

  await ensureSuccess(response, SAVE_ERROR_MESSAGE);
}
