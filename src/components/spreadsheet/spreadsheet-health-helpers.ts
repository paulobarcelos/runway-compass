// ABOUTME: Normalizes spreadsheet diagnostics returned by the health service.
// ABOUTME: Provides helpers for retrieving per-sheet warning and error lists.

export type SpreadsheetIssueSeverity = "warning" | "error";

export interface SpreadsheetIssue {
  sheetId: string;
  sheetTitle: string;
  code: string | null;
  message: string;
  rowNumber: number | null;
  severity: SpreadsheetIssueSeverity;
}

export interface SpreadsheetDiagnosticsPayload {
  warnings?: unknown;
  errors?: unknown;
}

export interface SheetIssueGroup {
  sheetId: string;
  sheetTitle: string;
  warnings: SpreadsheetIssue[];
  errors: SpreadsheetIssue[];
  hasIssues: boolean;
  hasErrors: boolean;
}

interface FilterSheetIssuesOptions {
  sheetId: string;
  fallbackTitle?: string;
}

type RawIssue = Record<string, unknown> | null | undefined;

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asRowNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeIssue(raw: RawIssue, severity: SpreadsheetIssueSeverity): SpreadsheetIssue | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const sheetId = asString(record.sheetId);
  const message = asString(record.message);

  if (!sheetId || !message) {
    return null;
  }

  const sheetTitle = asString(record.sheetTitle) ?? sheetId;

  return {
    sheetId,
    sheetTitle,
    code: asString(record.code),
    message,
    rowNumber: asRowNumber(record.rowNumber),
    severity,
  };
}

function collectIssues(
  source: unknown,
  severity: SpreadsheetIssueSeverity,
): SpreadsheetIssue[] {
  if (!Array.isArray(source)) {
    return [];
  }

  const normalized: SpreadsheetIssue[] = [];

  for (const entry of source) {
    const issue = normalizeIssue(entry as RawIssue, severity);

    if (issue) {
      normalized.push(issue);
    }
  }

  return normalized;
}

export function filterSheetIssues(
  diagnostics: SpreadsheetDiagnosticsPayload | null | undefined,
  options: FilterSheetIssuesOptions,
): SheetIssueGroup {
  const sheetId = options.sheetId;
  const fallbackTitle = options.fallbackTitle ?? sheetId;

  const warnings = collectIssues(diagnostics?.warnings, "warning").filter(
    (issue) => issue.sheetId === sheetId,
  );

  const errors = collectIssues(diagnostics?.errors, "error").filter(
    (issue) => issue.sheetId === sheetId,
  );

  const sheetTitle =
    errors[0]?.sheetTitle ??
    warnings[0]?.sheetTitle ??
    fallbackTitle;

  return {
    sheetId,
    sheetTitle,
    warnings,
    errors,
    hasIssues: warnings.length > 0 || errors.length > 0,
    hasErrors: errors.length > 0,
  };
}

export function flattenSpreadsheetIssues(
  diagnostics: SpreadsheetDiagnosticsPayload | null | undefined,
): SpreadsheetIssue[] {
  const warnings = collectIssues(diagnostics?.warnings, "warning");
  const errors = collectIssues(diagnostics?.errors, "error");
  return warnings.concat(errors);
}
