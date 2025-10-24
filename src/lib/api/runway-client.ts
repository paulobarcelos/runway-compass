// ABOUTME: Wraps runway projection API calls for client-side consumption.
// ABOUTME: Normalizes responses and raises typed errors for failures.
import type { RunwayProjectionRecord } from "@/server/google/repository/runway-projection-repository";

const FETCH_ERROR_MESSAGE = "Failed to fetch runway projection";

export class RunwayClientError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RunwayClientError";
    this.status = status;
  }
}

function ensureSpreadsheetId(value: string) {
  if (!value || !value.trim()) {
    throw new Error("Missing spreadsheetId");
  }

  return value.trim();
}

async function parseRunwayPayload(response: Response, defaultMessage: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    runway?: unknown;
    error?: unknown;
  };

  if (!response.ok) {
    const message =
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error.trim()
        : defaultMessage;

    throw new RunwayClientError(response.status, message);
  }

  const rows = Array.isArray(payload?.runway) ? payload.runway : [];
  return rows as RunwayProjectionRecord[];
}

export async function fetchRunwayProjection(
  spreadsheetId: string,
): Promise<RunwayProjectionRecord[]> {
  const normalizedId = ensureSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `/api/runway?spreadsheetId=${encodeURIComponent(normalizedId)}`,
  );

  return parseRunwayPayload(response, FETCH_ERROR_MESSAGE);
}
