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
  sheetGid: number | null;
}

export interface SpreadsheetDiagnosticsPayload {
  warnings?: unknown;
  errors?: unknown;
  sheets?: unknown;
}

export interface SheetIssueGroup {
  sheetId: string;
  sheetTitle: string;
  sheetGid: number | null;
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

interface SheetMeta {
  sheetId: string;
  sheetTitle: string;
  sheetGid: number | null;
}

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

function normalizeSheetMeta(value: unknown): SheetMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const sheetId = asString(record.sheetId);

  if (!sheetId) {
    return null;
  }

  return {
    sheetId,
    sheetTitle: asString(record.sheetTitle) ?? sheetId,
    sheetGid: asOptionalNumber(record.sheetGid),
  };
}

function getSheetsIndex(source: unknown): Map<string, SheetMeta> {
  const index = new Map<string, SheetMeta>();

  if (!Array.isArray(source)) {
    return index;
  }

  for (const entry of source) {
    const meta = normalizeSheetMeta(entry);

    if (meta) {
      index.set(meta.sheetId, meta);
    }
  }

  return index;
}

function asOptionalNumber(value: unknown): number | null {
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
    sheetGid: asOptionalNumber(record.sheetGid),
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
  const sheetsIndex = getSheetsIndex(diagnostics?.sheets);

  const warnings = collectIssues(diagnostics?.warnings, "warning").filter(
    (issue) => issue.sheetId === sheetId,
  );

  const errors = collectIssues(diagnostics?.errors, "error").filter(
    (issue) => issue.sheetId === sheetId,
  );

  const sheetTitle =
    errors[0]?.sheetTitle ??
    warnings[0]?.sheetTitle ??
    sheetsIndex.get(sheetId)?.sheetTitle ??
    fallbackTitle;

  const sheetGid =
    errors[0]?.sheetGid ??
    warnings[0]?.sheetGid ??
    sheetsIndex.get(sheetId)?.sheetGid ??
    null;

  return {
    sheetId,
    sheetTitle,
    sheetGid,
    warnings,
    errors,
    hasIssues: warnings.length > 0 || errors.length > 0,
    hasErrors: errors.length > 0,
  };
}

export function flattenSpreadsheetIssues(
  diagnostics: SpreadsheetDiagnosticsPayload | null | undefined,
): SpreadsheetIssue[] {
  const sheetsIndex = getSheetsIndex(diagnostics?.sheets);
  const warnings = collectIssues(diagnostics?.warnings, "warning");
  const errors = collectIssues(diagnostics?.errors, "error");
  const issues = warnings.concat(errors);

  for (const issue of issues) {
    if (issue.sheetGid == null || !issue.sheetTitle) {
      const meta = sheetsIndex.get(issue.sheetId);

      if (meta) {
        issue.sheetGid = issue.sheetGid ?? meta.sheetGid;
        issue.sheetTitle = meta.sheetTitle;
      }
    }
  }

  return issues;
}

export function buildSheetUrl(spreadsheetId: string | null, sheetGid: number | null) {
  if (!spreadsheetId) {
    return null;
  }

  if (sheetGid != null && Number.isFinite(sheetGid)) {
    return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit#gid=${sheetGid}`;
  }

  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
}
