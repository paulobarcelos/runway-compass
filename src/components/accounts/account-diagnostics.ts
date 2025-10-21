// ABOUTME: Normalizes account diagnostics emitted by the accounts API.
// ABOUTME: Provides warning types for the accounts manager UI.

export interface AccountWarning {
  rowNumber: number | null;
  message: string;
}

function coerceRowNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function normalizeAccountWarnings(source: unknown): AccountWarning[] {
  if (!Array.isArray(source)) {
    return [];
  }

  const normalized: AccountWarning[] = [];

  for (const entry of source) {
    if (entry == null || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;

    const rowCandidate =
      "rowNumber" in record
        ? record.rowNumber
        : "row" in record
          ? record.row
          : null;

    const messageCandidate = record.message;
    const message = typeof messageCandidate === "string" ? messageCandidate.trim() : "";

    if (!message) {
      continue;
    }

    normalized.push({
      rowNumber: coerceRowNumber(rowCandidate),
      message,
    });
  }

  return normalized;
}
