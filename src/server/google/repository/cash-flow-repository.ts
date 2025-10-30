// ABOUTME: Loads and persists ledger entries from the `cash_flows` sheet.
// ABOUTME: Provides helpers for filtering and monthly summaries based on entry amounts.
import { randomUUID } from "node:crypto";
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import { CASH_FLOWS_SHEET_SCHEMA, dataRange } from "@/server/google/sheet-schemas";
import {
  ensureHeaderRow,
  isEmptyRow,
  normalizeRow,
  requireNumber,
} from "./sheet-utils";

const CASH_FLOW_HEADERS = CASH_FLOWS_SHEET_SCHEMA.headers;
const CASH_FLOW_RANGE = dataRange(CASH_FLOWS_SHEET_SCHEMA, 4000);

const VALID_STATUSES = new Set(["planned", "posted"] as const);

export type CashFlowStatus = "planned" | "posted";

export interface CashFlowEntry {
  flowId: string;
  date: string;
  amount: number;
  status: CashFlowStatus;
  accountId: string;
  categoryId: string;
  note: string;
}

// Maintain compatibility with modules that import CashFlowRecord.
export type CashFlowRecord = CashFlowEntry;

export interface CashFlowDraft extends Omit<CashFlowEntry, "flowId"> {
  flowId?: string | null;
}

interface CashFlowRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

function sanitizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeOptionalString(value: unknown) {
  const normalized = sanitizeString(value);
  return normalized ? normalized : "";
}

function parseCashFlowRow(row: unknown[], rowIndex: number): CashFlowEntry | null {
  const normalized = normalizeRow(
    Array.isArray(row) ? row : [],
    CASH_FLOW_HEADERS.length,
  );

  if (isEmptyRow(normalized)) {
    return null;
  }

  const [flowIdRaw, dateRaw, amountRaw, statusRaw, accountIdRaw, categoryIdRaw, noteRaw] = normalized;

  const flowId = sanitizeString(flowIdRaw);
  if (!flowId) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing flow_id`);
  }

  const date = sanitizeString(dateRaw);
  if (!date) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing date`);
  }

  const amount = requireNumber(amountRaw, {
    field: "amount",
    rowIndex,
  });

  const status = sanitizeString(statusRaw).toLowerCase();
  if (!VALID_STATUSES.has(status as CashFlowStatus)) {
    throw new Error(
      `Invalid cash flow row at index ${rowIndex}: status must be planned or posted`,
    );
  }

  const accountId = sanitizeString(accountIdRaw);
  if (!accountId) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing account_id`);
  }

  const categoryId = sanitizeString(categoryIdRaw);
  if (!categoryId) {
    throw new Error(`Invalid cash flow row at index ${rowIndex}: missing category_id`);
  }

  const note = sanitizeOptionalString(noteRaw);

  return {
    flowId,
    date,
    amount,
    status: status as CashFlowStatus,
    accountId,
    categoryId,
    note,
  };
}

function extractMonth(value: string | null | undefined) {
  const normalized = sanitizeString(value);

  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{4}-\d{2})/);
  return match ? match[1] : null;
}

export interface MonthlyCashFlowSummary {
  month: string;
  plannedIncome: number;
  plannedExpense: number;
  postedIncome: number;
  postedExpense: number;
}

export function summarizeCashFlowsByMonth(entries: CashFlowEntry[]) {
  const accumulator = new Map<string, MonthlyCashFlowSummary>();

  type MonthlySummaryField = Exclude<keyof MonthlyCashFlowSummary, "month">;

  function add(month: string | null, field: MonthlySummaryField, amount: number) {
    if (!month) {
      return;
    }

    let bucket = accumulator.get(month);

    if (!bucket) {
      bucket = {
        month,
        plannedIncome: 0,
        plannedExpense: 0,
        postedIncome: 0,
        postedExpense: 0,
      };
      accumulator.set(month, bucket);
    }

    bucket[field] += amount;
  }

  for (const entry of entries) {
    const month = extractMonth(entry.date);
    const isIncome = entry.amount >= 0;
    const amount = Math.abs(entry.amount);

    if (entry.status === "planned") {
      add(month, isIncome ? "plannedIncome" : "plannedExpense", amount);
      continue;
    }

    add(month, isIncome ? "postedIncome" : "postedExpense", amount);
  }

  const ordered = Array.from(accumulator.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return new Map<string, MonthlyCashFlowSummary>(ordered);
}

export function createCashFlowRepository({
  sheets,
  spreadsheetId,
}: CashFlowRepositoryOptions) {
  async function clearRange() {
    await executeWithRetry(() =>
      sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: CASH_FLOW_RANGE,
      }),
    );
  }

  async function writeRows(records: CashFlowEntry[]) {
    const rows: string[][] = [Array.from(CASH_FLOW_HEADERS) as string[]];

    for (const record of records) {
      rows.push([
        record.flowId,
        record.date,
        String(record.amount),
        record.status,
        record.accountId,
        record.categoryId,
        record.note,
      ]);
    }

    const range = dataRange(
      CASH_FLOWS_SHEET_SCHEMA,
      Math.max(records.length + 1, 1),
    );

    await clearRange();

    await executeWithRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: {
          values: rows,
        },
      }),
    );
  }

  async function loadEntries() {
    const response = await executeWithRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: CASH_FLOW_RANGE,
      }),
    );

    const rows = (response.data.values as unknown[][] | undefined) ?? [];

    if (rows.length === 0) {
      return [] as CashFlowEntry[];
    }

    const [headerRow, ...dataRows] = rows;

    ensureHeaderRow(headerRow, CASH_FLOW_HEADERS, "cash_flows");

    const entries: CashFlowEntry[] = [];

    for (let index = 0; index < dataRows.length; index += 1) {
      const parsed = parseCashFlowRow(dataRows[index], index + 2);

      if (parsed) {
        entries.push(parsed);
      }
    }

    return entries;
  }

  function sanitizeDraft(draft: CashFlowDraft, flowId?: string): CashFlowEntry {
    const date = sanitizeString(draft.date);
    if (!date) {
      throw new Error("Ledger entry date is required");
    }

    if (!Number.isFinite(draft.amount)) {
      throw new Error("Ledger entry amount must be a finite number");
    }

    const status = sanitizeString(draft.status).toLowerCase();
    if (!VALID_STATUSES.has(status as CashFlowStatus)) {
      throw new Error("Ledger entry status must be planned or posted");
    }

    const accountId = sanitizeString(draft.accountId);
    if (!accountId) {
      throw new Error("Ledger entry account_id is required");
    }

    const categoryId = sanitizeString(draft.categoryId);
    if (!categoryId) {
      throw new Error("Ledger entry category_id is required");
    }

    return {
      flowId: flowId ?? randomUUID(),
      date,
      amount: Number(draft.amount),
      status: status as CashFlowStatus,
      accountId,
      categoryId,
      note: sanitizeOptionalString(draft.note),
    };
  }

  return {
    async list(): Promise<CashFlowEntry[]> {
      return loadEntries();
    },

    async listByStatus(statuses: readonly CashFlowStatus[]) {
      if (!Array.isArray(statuses) || statuses.length === 0) {
        return [] as CashFlowEntry[];
      }

      const allowed = new Set(
        statuses.map((status) => status.toLowerCase() as CashFlowStatus),
      );

      const entries = await loadEntries();
      return entries.filter((entry) => allowed.has(entry.status));
    },

    async save(records: CashFlowEntry[]) {
      await writeRows(records);
    },

    async create(draft: CashFlowDraft): Promise<CashFlowEntry> {
      const entry = sanitizeDraft(draft);
      const existing = await loadEntries();
      const next = [...existing, entry];
      await writeRows(next);
      return entry;
    },

    async update(flowId: string, changes: Partial<CashFlowEntry>) {
      const existing = await loadEntries();
      let updated: CashFlowEntry | null = null;

      const next = existing.map((entry) => {
        if (entry.flowId !== flowId) {
          return entry;
        }

        const draft: CashFlowDraft = {
          flowId,
          date: changes.date !== undefined ? changes.date : entry.date,
          amount: changes.amount !== undefined ? changes.amount : entry.amount,
          status: changes.status !== undefined ? changes.status : entry.status,
          accountId:
            changes.accountId !== undefined ? changes.accountId : entry.accountId,
          categoryId:
            changes.categoryId !== undefined ? changes.categoryId : entry.categoryId,
          note: changes.note !== undefined ? changes.note : entry.note,
        };

        updated = sanitizeDraft(draft, flowId);
        return updated;
      });

      if (!updated) {
        return null;
      }

      await writeRows(next);
      return updated;
    },

    async remove(flowId: string) {
      const existing = await loadEntries();
      const next = existing.filter((entry) => entry.flowId !== flowId);

      if (next.length === existing.length) {
        return;
      }

      await writeRows(next);
    },
  };
}
