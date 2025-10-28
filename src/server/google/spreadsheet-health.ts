// ABOUTME: Aggregates spreadsheet diagnostics across Google Sheets tabs.
// ABOUTME: Fetches sheet metadata and normalizes warning/error payloads.
import type { Session } from "next-auth";
import type { sheets_v4 } from "googleapis";

import { getSession } from "@/server/auth/session";

import { createSheetsClient, type GoogleAuthTokens } from "./clients";
import { executeWithRetry } from "./retry";
import {
  createAccountsRepository,
  type AccountsDiagnostics,
} from "./repository/accounts-repository";
import { createCategoriesRepository } from "./repository/categories-repository";
import { createCashFlowRepository } from "./repository/cash-flow-repository";
import { createSnapshotsRepository } from "./repository/snapshots-repository";

export type SpreadsheetDiagnosticSeverity = "warning" | "error";

export interface SheetDiagnostic {
  sheetId: string;
  sheetTitle: string;
  sheetGid?: number;
  severity: SpreadsheetDiagnosticSeverity;
  code: string;
  message: string;
  rowNumber: number | null;
}

export interface SpreadsheetDiagnostics {
  warnings: SheetDiagnostic[];
  errors: SheetDiagnostic[];
  sheets: SheetContext[];
}

interface MetadataMapEntry {
  title: string;
  sheetId?: number;
}

type MetadataMap = Map<string, MetadataMapEntry>;

type SessionWithGoogleTokens = Session & {
  googleTokens?: GoogleAuthTokens | null;
};

interface SheetContext {
  sheetId: string;
  sheetTitle: string;
  sheetGid?: number;
}

const SHEET_LABELS: Record<string, string> = {
  accounts: "Accounts",
  categories: "Categories",
  snapshots: "Snapshots",
  cash_flows: "Cash Flows",
};

function toMetadataMap(response: sheets_v4.Schema$Spreadsheet | undefined): MetadataMap {
  const map: MetadataMap = new Map();

  const sheets = response?.sheets ?? [];

  for (const sheet of sheets) {
    const properties = sheet.properties;

    if (!properties?.title) {
      continue;
    }

    map.set(properties.title, {
      title: properties.title,
      sheetId: properties.sheetId ?? undefined,
    });
  }

  return map;
}

function resolveContext(map: MetadataMap, key: string): SheetContext {
  const metadata = map.get(key);
  const label = SHEET_LABELS[key] ?? null;
  const sheetTitle = label ?? metadata?.title ?? key;

  return {
    sheetId: key,
    sheetTitle,
    sheetGid: metadata?.sheetId,
  };
}

function normalizeErrorCode(code: unknown): string | null {
  if (typeof code === "string" && code.trim()) {
    return code.trim();
  }

  if (typeof code === "number" && Number.isFinite(code)) {
    return String(Math.trunc(code));
  }

  return null;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Unknown error";
}

function toErrorDiagnostic(context: SheetContext, error: unknown): SheetDiagnostic {
  const code =
    (error && typeof error === "object"
      ? normalizeErrorCode((error as { code?: unknown }).code)
      : null) ?? "exception";

  return {
    sheetId: context.sheetId,
    sheetTitle: context.sheetTitle,
    sheetGid: context.sheetGid,
    severity: "error",
    code,
    message: extractErrorMessage(error),
    rowNumber: null,
  };
}

function deriveSheetError(context: SheetContext, error: unknown): SheetDiagnostic {
  const diagnostic = toErrorDiagnostic(context, error);
  if (diagnostic.code !== "exception") {
    return diagnostic;
  }

  const normalizedMessage = diagnostic.message.toLowerCase();

  if (
    normalizedMessage.includes("header does not match expected schema") ||
    normalizedMessage.includes("header mismatch")
  ) {
    return {
      ...diagnostic,
      code: "header_mismatch",
    };
  }

  if (normalizedMessage.includes("missing sheet") || normalizedMessage.includes("sheet not found")) {
    return {
      ...diagnostic,
      code: "missing_sheet",
    };
  }

  return diagnostic;
}

function toWarningDiagnostic(context: SheetContext, warning: { code: string; message: string; rowNumber?: number | null }): SheetDiagnostic {
  return {
    sheetId: context.sheetId,
    sheetTitle: context.sheetTitle,
    sheetGid: context.sheetGid,
    severity: "warning",
    code: warning.code,
    message: warning.message,
    rowNumber:
      typeof warning.rowNumber === "number" && Number.isFinite(warning.rowNumber)
        ? Math.trunc(warning.rowNumber)
        : null,
  };
}

function toSheetErrorDiagnostic(context: SheetContext, error: { code: string; message: string }): SheetDiagnostic {
  return {
    sheetId: context.sheetId,
    sheetTitle: context.sheetTitle,
    sheetGid: context.sheetGid,
    severity: "error",
    code: error.code,
    message: error.message,
    rowNumber: null,
  };
}

async function loadMetadata({
  sheets,
  spreadsheetId,
}: {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}): Promise<MetadataMap> {
  try {
    const response = await executeWithRetry(() =>
      sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets(properties(sheetId,title))",
      }),
    );

    return toMetadataMap(response.data);
  } catch {
    return new Map();
  }
}

type LoadAccountsDiagnostics = (options: {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}) => Promise<AccountsDiagnostics>;

type LoadSheet = (options: {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}) => Promise<unknown>;

const defaultLoadAccountsDiagnostics: LoadAccountsDiagnostics = async ({
  sheets,
  spreadsheetId,
}) => {
  const repository = createAccountsRepository({ sheets, spreadsheetId });
  return repository.listWithDiagnostics();
};

const defaultLoadCategories: LoadSheet = async ({ sheets, spreadsheetId }) => {
  const repository = createCategoriesRepository({ sheets, spreadsheetId });
  await repository.list();
};

const defaultLoadSnapshots: LoadSheet = async ({ sheets, spreadsheetId }) => {
  const repository = createSnapshotsRepository({ sheets, spreadsheetId });
  await repository.list();
};

interface CollectSpreadsheetDiagnosticsOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  loadAccountsDiagnostics?: LoadAccountsDiagnostics;
  loadCategories?: LoadSheet;
  loadSnapshots?: LoadSheet;
  loadCashFlows?: LoadSheet;
}

export async function collectSpreadsheetDiagnostics({
  sheets,
  spreadsheetId,
  loadAccountsDiagnostics = defaultLoadAccountsDiagnostics,
  loadCategories = defaultLoadCategories,
  loadSnapshots = defaultLoadSnapshots,
  loadCashFlows = async ({ sheets: sheetsClient, spreadsheetId: id }) => {
    const repository = createCashFlowRepository({ sheets: sheetsClient, spreadsheetId: id });
    await repository.list();
  },
}: CollectSpreadsheetDiagnosticsOptions): Promise<SpreadsheetDiagnostics> {
  const metadata = await loadMetadata({ sheets, spreadsheetId });
  const warnings: SheetDiagnostic[] = [];
  const errors: SheetDiagnostic[] = [];

  const accountsContext = resolveContext(metadata, "accounts");
  const categoriesContext = resolveContext(metadata, "categories");
  const snapshotsContext = resolveContext(metadata, "snapshots");
  const cashFlowsContext = resolveContext(metadata, "cash_flows");
  const sheetContexts: SheetContext[] = [
    accountsContext,
    categoriesContext,
    snapshotsContext,
    cashFlowsContext,
  ];

  try {
    const diagnostics = await loadAccountsDiagnostics({ sheets, spreadsheetId });

    for (const warning of diagnostics.warnings) {
      warnings.push(toWarningDiagnostic(accountsContext, warning));
    }

    for (const error of diagnostics.errors) {
      errors.push(toSheetErrorDiagnostic(accountsContext, error));
    }
  } catch (error) {
    errors.push(toErrorDiagnostic(accountsContext, error));
  }

  try {
    await loadCategories({ sheets, spreadsheetId });
  } catch (error) {
    errors.push(deriveSheetError(categoriesContext, error));
  }

  try {
    await loadSnapshots({ sheets, spreadsheetId });
  } catch (error) {
    errors.push(deriveSheetError(snapshotsContext, error));
  }

  try {
    await loadCashFlows({ sheets, spreadsheetId });
  } catch (error) {
    errors.push(deriveSheetError(cashFlowsContext, error));
  }

  return { warnings, errors, sheets: sheetContexts };
}

interface FetchSpreadsheetDiagnosticsOptions {
  spreadsheetId: string;
  getSession?: () => Promise<Session | null>;
  createSheetsClient?: (tokens: GoogleAuthTokens) => sheets_v4.Sheets;
  collectDiagnostics?: (options: {
    sheets: sheets_v4.Sheets;
    spreadsheetId: string;
  }) => Promise<SpreadsheetDiagnostics>;
}

export async function fetchSpreadsheetDiagnostics({
  spreadsheetId,
  getSession: resolveSession = getSession,
  createSheetsClient: resolveSheetsClient = createSheetsClient,
  collectDiagnostics = collectSpreadsheetDiagnostics,
}: FetchSpreadsheetDiagnosticsOptions): Promise<SpreadsheetDiagnostics> {
  if (!spreadsheetId) {
    throw new Error("Missing spreadsheet identifier");
  }

  const session = await resolveSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = (session as SessionWithGoogleTokens).googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = resolveSheetsClient(tokens);

  return collectDiagnostics({ sheets, spreadsheetId });
}
