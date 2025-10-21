// ABOUTME: Normalizes account diagnostics emitted by the accounts API.
// ABOUTME: Provides issue types that the accounts manager can present.

export type AccountIssueSeverity = "warning" | "error";

export interface AccountIssue {
  severity: AccountIssueSeverity;
  rowNumber: number | null;
  code: string | null;
  message: string;
}

export interface AccountWarning extends AccountIssue {
  severity: "warning";
}

export interface AccountError extends AccountIssue {
  severity: "error";
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

function coerceCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
      code: coerceCode(record.code),
      severity: "warning",
      message,
    });
  }

  return normalized;
}

export function normalizeAccountErrors(source: unknown): AccountError[] {
  if (!Array.isArray(source)) {
    return [];
  }

  const normalized: AccountError[] = [];

  for (const entry of source) {
    if (entry == null || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;

    const messageCandidate = record.message;
    const message = typeof messageCandidate === "string" ? messageCandidate.trim() : "";

    if (!message) {
      continue;
    }

    normalized.push({
      severity: "error",
      rowNumber: coerceRowNumber(record.rowNumber ?? record.row),
      code: coerceCode(record.code),
      message,
    });
  }

  return normalized;
}

export function isAccountError(issue: AccountIssue): issue is AccountError {
  return issue.severity === "error";
}

export function isAccountWarning(issue: AccountIssue): issue is AccountWarning {
  return issue.severity === "warning";
}
