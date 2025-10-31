// ABOUTME: Manages budget horizon sheet state with metadata-driven month columns.
// ABOUTME: Loads, saves, and reshapes per-category monthly budgets with currency support.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "@/server/google/retry";
import {
  BUDGET_HORIZON_SHEET_SCHEMA,
  columnIndexToLetter,
} from "@/server/google/sheet-schemas";
import { createMetaRepository } from "./meta-repository";
import { normalizeRow } from "./sheet-utils";

const BUDGET_HORIZON_START_KEY = "budget_horizon_start";
const BUDGET_HORIZON_MONTHS_KEY = "budget_horizon_months";
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MONTH_COUNT = 12;
const MAX_MONTH_COUNT = 120;

export interface BudgetPlanRecord {
  recordId: string;
  categoryId: string;
  month: number;
  year: number;
  amount: number;
  currency: string;
  rolloverBalance: number;
}

export interface BudgetHorizonMetadata {
  start: string;
  months: number;
}

interface BudgetHorizonRepositoryOptions {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
  now?: () => number;
}

interface MonthDescriptor {
  key: string;
  month: number;
  year: number;
  index: number;
}

interface CategoryMonthEntry {
  amount: number;
  currency: string;
}

function computeDefaultStart(nowTimestamp: number) {
  const date = new Date(nowTimestamp);
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  return toIsoDate(firstDay);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function createRecordId(categoryId: string, key: string) {
  return `budget_${categoryId}_${key}`;
}

function ensureMetadata(
  entries: Map<string, string>,
  nowTimestamp: number,
): BudgetHorizonMetadata {
  const fallbackStart = computeDefaultStart(nowTimestamp);
  const rawStart = entries.get(BUDGET_HORIZON_START_KEY) ?? fallbackStart;
  const rawMonths = entries.get(BUDGET_HORIZON_MONTHS_KEY) ?? String(DEFAULT_MONTH_COUNT);

  const start = ISO_DATE_PATTERN.test(rawStart.trim()) ? rawStart.trim() : fallbackStart;
  const parsedMonths = Number.parseInt(rawMonths, 10);

  const months = Number.isFinite(parsedMonths)
    ? Math.min(Math.max(parsedMonths, 1), MAX_MONTH_COUNT)
    : DEFAULT_MONTH_COUNT;

  return {
    start,
    months,
  };
}


function normalizeInputMetadata(metadata: BudgetHorizonMetadata): BudgetHorizonMetadata {
  if (!ISO_DATE_PATTERN.test(metadata.start)) {
    throw new Error("Invalid budget horizon start; expected YYYY-MM-DD");
  }

  const parsedMonths = Number(metadata.months);

  if (!Number.isInteger(parsedMonths) || parsedMonths <= 0 || parsedMonths > MAX_MONTH_COUNT) {
    throw new Error("Invalid budget horizon month count");
  }

  return {
    start: metadata.start,
    months: parsedMonths,
  };
}

function buildMonthSequence(metadata: BudgetHorizonMetadata): MonthDescriptor[] {
  const [yearStr, monthStr] = metadata.start.split("-", 3);
  const baseYear = Number.parseInt(yearStr, 10);
  const baseMonth = Number.parseInt(monthStr, 10);

  if (!Number.isInteger(baseYear) || !Number.isInteger(baseMonth)) {
    throw new Error("Invalid budget horizon metadata");
  }

  const months: MonthDescriptor[] = [];

  for (let index = 0; index < metadata.months; index += 1) {
    const cursor = new Date(baseYear, baseMonth - 1 + index, 1);
    months.push({
      key: monthKey(cursor.getFullYear(), cursor.getMonth() + 1),
      month: cursor.getMonth() + 1,
      year: cursor.getFullYear(),
      index,
    });
  }

  return months;
}

function buildHeaderRow(months: MonthDescriptor[]) {
  const headers: string[] = ["category_id"];

  for (const descriptor of months) {
    headers.push(`${descriptor.key}_amount`, `${descriptor.key}_currency`);
  }

  return headers;
}

function buildRange(columnCount: number, rowCount: number) {
  const effectiveColumns = Math.max(columnCount, 1);
  const effectiveRows = Math.max(rowCount, 1);
  const lastColumn = columnIndexToLetter(effectiveColumns);
  return `${BUDGET_HORIZON_SHEET_SCHEMA.title}!A1:${lastColumn}${effectiveRows}`;
}

function parseAmount(value: string, context: { categoryId: string; monthKey: string }) {
  const trimmed = value.trim();

  if (!trimmed) {
    return 0;
  }

  const numeric = Number(trimmed);

  if (!Number.isFinite(numeric)) {
    throw new Error(
      `Invalid amount for category ${context.categoryId} in ${context.monthKey}: ${value}`,
    );
  }

  return numeric;
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase();
}

function toRows(
  categoryOrder: string[],
  categoryMap: Map<string, Map<string, CategoryMonthEntry>>,
  months: MonthDescriptor[],
) {
  const header = buildHeaderRow(months);
  const rows: string[][] = [header];

  for (const categoryId of categoryOrder) {
    const monthMap = categoryMap.get(categoryId);

    if (!monthMap) {
      continue;
    }

    const row: string[] = [categoryId];

    for (const descriptor of months) {
      const entry = monthMap.get(descriptor.key);
      const amount = entry ? entry.amount : 0;
      const currency = entry ? entry.currency : "";

      row.push(String(amount));
      row.push(currency);
    }

    rows.push(row);
  }

  return rows;
}

export function createBudgetHorizonRepository({
  sheets,
  spreadsheetId,
  now = Date.now,
}: BudgetHorizonRepositoryOptions) {
  const metaRepository = createMetaRepository({ sheets, spreadsheetId });

  async function saveMetadata(metadata: BudgetHorizonMetadata) {
    const entries = await metaRepository.load();
    entries.set(BUDGET_HORIZON_START_KEY, metadata.start);
    entries.set(BUDGET_HORIZON_MONTHS_KEY, String(metadata.months));
    await metaRepository.save(entries);
  }

  async function writeRows(rows: string[][]) {
    const columnCount = rows[0]?.length ?? 1;
    const range = buildRange(columnCount, rows.length);

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


  async function loadSnapshot() {
    const metadata = ensureMetadata(await metaRepository.load(), now());
    const months = buildMonthSequence(metadata);
    const expectedHeader = buildHeaderRow(months);

    const response = await executeWithRetry(() =>
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: BUDGET_HORIZON_SHEET_SCHEMA.title,
      }),
    );

    const rawValues = (response.data.values as unknown[][] | undefined) ?? [];

    if (rawValues.length === 0) {
      await writeRows([expectedHeader]);
      return {
        metadata,
        months,
        categoryOrder: [] as string[],
        categoryMap: new Map<string, Map<string, CategoryMonthEntry>>(),
      };
    }

    const [rawHeader, ...dataRows] = rawValues;
    const header = normalizeRow(Array.isArray(rawHeader) ? rawHeader : [], expectedHeader.length);

    const headerMatches = expectedHeader.every(
      (value, index) => header[index] === value,
    );

    if (!headerMatches) {
      const rawHeaderValues = Array.isArray(rawHeader) ? rawHeader : [];
      const nonEmptyCells = rawHeaderValues
        .map((cell) => (typeof cell === "string" ? cell.trim().toLowerCase() : ""))
        .filter((cell) => cell.length > 0);

      if (dataRows.length === 0 && nonEmptyCells.length <= 1) {
        await writeRows([expectedHeader]);
        return {
          metadata,
          months,
          categoryOrder: [] as string[],
          categoryMap: new Map<string, Map<string, CategoryMonthEntry>>(),
        };
      }

      throw new Error("budget_horizon header does not match expected schema");
    }

    const categoryMap = new Map<string, Map<string, CategoryMonthEntry>>();
    const categoryOrder: string[] = [];
    const columnCount = expectedHeader.length;

    for (const rawRow of dataRows) {
      const normalized = normalizeRow(Array.isArray(rawRow) ? rawRow : [], columnCount);
      const categoryId = normalized[0]?.trim();

      if (!categoryId) {
        continue;
      }

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, new Map());
        categoryOrder.push(categoryId);
      }

      const monthMap = categoryMap.get(categoryId)!;

      for (const descriptor of months) {
        const amountIndex = 1 + descriptor.index * 2;
        const currencyIndex = amountIndex + 1;
        const amount = parseAmount(normalized[amountIndex] ?? "", {
          categoryId,
          monthKey: descriptor.key,
        });
        const currency = normalizeCurrency(normalized[currencyIndex] ?? "");

        monthMap.set(descriptor.key, {
          amount,
          currency,
        });
      }
    }

    return {
      metadata,
      months,
      categoryOrder,
      categoryMap,
    };
  }

  async function saveSnapshot(
    categoryOrder: string[],
    categoryMap: Map<string, Map<string, CategoryMonthEntry>>,
    metadata: BudgetHorizonMetadata,
  ) {
    const months = buildMonthSequence(metadata);
    const rows = toRows(categoryOrder, categoryMap, months);

    await saveMetadata(metadata);
    await writeRows(rows);
  }

  async function applyHorizon(target: BudgetHorizonMetadata) {
    const normalizedTarget = normalizeInputMetadata(target);
    const snapshot = await loadSnapshot();
    const targetMonths = buildMonthSequence(normalizedTarget);

    const categoryOrder = snapshot.categoryOrder.length
      ? snapshot.categoryOrder
      : Array.from(snapshot.categoryMap.keys());

    const categoryMap = new Map<string, Map<string, CategoryMonthEntry>>();

    for (const categoryId of categoryOrder) {
      const existing = snapshot.categoryMap.get(categoryId) ?? new Map();
      const nextEntries = new Map<string, CategoryMonthEntry>();
      let hasPrevious = false;
      let previousAmount = 0;
      let previousCurrency = "";

      for (const descriptor of targetMonths) {
        const existingEntry = existing.get(descriptor.key);

        if (existingEntry) {
          hasPrevious = true;
          previousAmount = existingEntry.amount;
          previousCurrency = existingEntry.currency;
          nextEntries.set(descriptor.key, {
            amount: existingEntry.amount,
            currency: existingEntry.currency,
          });
          continue;
        }

        const amount = hasPrevious ? previousAmount : 0;
        const currency = hasPrevious ? previousCurrency : "";

        nextEntries.set(descriptor.key, {
          amount,
          currency,
        });
      }

      categoryMap.set(categoryId, nextEntries);
    }

    await saveSnapshot(categoryOrder, categoryMap, normalizedTarget);

    return normalizedTarget;
  }

  async function materialize() {
    const snapshot = await loadSnapshot();
    const records: BudgetPlanRecord[] = [];

    for (const categoryId of snapshot.categoryOrder) {
      const monthMap = snapshot.categoryMap.get(categoryId);

        if (!monthMap) {
          continue;
        }

        for (const descriptor of snapshot.months) {
          const entry = monthMap.get(descriptor.key) ?? { amount: 0, currency: "" };

          records.push({
            recordId: createRecordId(categoryId, descriptor.key),
            categoryId,
            month: descriptor.month,
            year: descriptor.year,
            amount: entry.amount,
            currency: entry.currency,
            rolloverBalance: 0,
        });
      }
    }

    return {
      snapshot,
      records,
    };
  }

  return {
    async load(): Promise<{ metadata: BudgetHorizonMetadata; records: BudgetPlanRecord[] }> {
      const { snapshot, records } = await materialize();

      return {
        metadata: snapshot.metadata,
        records,
      };
    },

    async list(): Promise<BudgetPlanRecord[]> {
      const { records } = await materialize();
      return records;
    },

    async save(
      records: BudgetPlanRecord[],
      metadata: BudgetHorizonMetadata,
    ): Promise<void> {
      const normalizedMetadata = normalizeInputMetadata(metadata);
      const months = buildMonthSequence(normalizedMetadata);
      const monthKeys = months.map((descriptor) => descriptor.key);
      const monthSet = new Set(monthKeys);

      const categoryMap = new Map<string, Map<string, CategoryMonthEntry>>();
      const categoryOrder: string[] = [];

      for (const record of records) {
        const key = monthKey(record.year, record.month);

        if (!monthSet.has(key)) {
          continue;
        }

        if (!categoryMap.has(record.categoryId)) {
          categoryMap.set(record.categoryId, new Map());
          categoryOrder.push(record.categoryId);
        }

        categoryMap.get(record.categoryId)!.set(key, {
          amount: record.amount,
          currency: normalizeCurrency(record.currency ?? ""),
        });
      }

      await saveSnapshot(categoryOrder, categoryMap, normalizedMetadata);
    },

    async expandHorizon(metadata: BudgetHorizonMetadata) {
      return applyHorizon(metadata);
    },

    async shrinkHorizon(metadata: BudgetHorizonMetadata) {
      return applyHorizon(metadata);
    },
  };
}

export const createBudgetPlanRepository = createBudgetHorizonRepository;
