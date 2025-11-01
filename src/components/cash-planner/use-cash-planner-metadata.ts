// ABOUTME: Loads accounts/categories for the cash planner and exposes lookup helpers.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AccountRecord } from "@/server/google/repository/accounts-repository";
import type { CategoryRecord } from "@/server/google/repository/categories-repository";

interface LedgerEntryRef {
  flowId: string;
  accountId: string | null | undefined;
  categoryId: string | null | undefined;
}

type MetadataStatus = "idle" | "loading" | "ready" | "error" | "blocked";

interface UseCashPlannerMetadataOptions {
  spreadsheetId?: string | null;
  disabled?: boolean;
  disabledMessage?: string | null;
  entries?: LedgerEntryRef[];
}

export interface CashPlannerMetadata {
  status: MetadataStatus;
  blockingMessage: string | null;
  error: string | null;
  categories: CategoryRecord[];
  accounts: AccountRecord[];
  categoriesById: Map<string, CategoryRecord>;
  accountsById: Map<string, AccountRecord>;
  incomeCategoryIds: string[];
  expenseCategoryIds: string[];
  categoryLabelsById: Map<string, string>;
  accountDisplayById: Map<string, string>;
  categoryOptions: { id: string; label: string }[];
  accountOptions: { id: string; name: string; currency: string }[];
  orphanAccountIds: string[];
  orphanCategoryIds: string[];
  orphanEntryLookup: Map<string, { account: boolean; category: boolean }>;
  reload: () => Promise<void>;
}

function normalizeCategory(entry: Record<string, unknown>): CategoryRecord {
  const categoryId = String(entry.categoryId ?? "").trim();
  const label = String(entry.label ?? "").trim();
  const color = String(entry.color ?? "").trim() || "#999999";
  const description = String(entry.description ?? "").trim();
  const sortOrder =
    typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder)
      ? entry.sortOrder
      : 0;

  return {
    categoryId,
    label,
    color,
    description,
    sortOrder,
  };
}

function normalizeAccount(entry: Record<string, unknown>): AccountRecord {
  const lastSnapshotRaw = String(entry.lastSnapshotAt ?? "").trim();

  return {
    accountId: String(entry.accountId ?? "").trim(),
    name: String(entry.name ?? "").trim(),
    type: String(entry.type ?? "").trim(),
    currency: String(entry.currency ?? "").trim().toUpperCase(),
    includeInRunway: Boolean(entry.includeInRunway),
    sortOrder:
      typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder)
        ? entry.sortOrder
        : 0,
    lastSnapshotAt: lastSnapshotRaw || null,
  };
}

export function useCashPlannerMetadata({
  spreadsheetId: spreadsheetIdProp = null,
  disabled = false,
  disabledMessage = null,
  entries: entriesProp = [],
}: UseCashPlannerMetadataOptions = {}): CashPlannerMetadata {
  const spreadsheetId = spreadsheetIdProp?.trim() || null;
  const entries = useMemo(
    () => (Array.isArray(entriesProp) ? entriesProp : []),
    [entriesProp],
  );
  const [status, setStatus] = useState<MetadataStatus>(() => {
    if (disabled) {
      return "blocked";
    }

    return spreadsheetId ? "idle" : "blocked";
  });
  const [blockingMessage, setBlockingMessage] = useState<string | null>(() => {
    if (disabled && disabledMessage) {
      return disabledMessage;
    }

    if (!spreadsheetId) {
      return "Connect a spreadsheet to manage cash flows.";
    }

    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const loadMetadata = useCallback(
    async ({ skipStatusReset = false }: { skipStatusReset?: boolean } = {}) => {
      if (disabled || !spreadsheetId) {
        setStatus("blocked");
        setBlockingMessage(
          disabled && disabledMessage
            ? disabledMessage
            : "Connect a spreadsheet to manage cash flows.",
        );
        setCategories([]);
        setAccounts([]);
        setError(null);
        return;
      }

      if (!skipStatusReset) {
        setStatus("loading");
        setBlockingMessage(null);
        setError(null);
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const [categoriesResponse, accountsResponse] = await Promise.all([
          fetch(`/api/categories?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
            signal: controller.signal,
          }),
          fetch(`/api/accounts?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
            signal: controller.signal,
          }),
        ]);

        if (!categoriesResponse.ok) {
          const payload = (await categoriesResponse.json().catch(() => ({}))) as {
            error?: unknown;
          };
          const message =
            typeof payload?.error === "string" && payload.error.trim()
              ? payload.error.trim()
              : "Failed to load categories";
          throw new Error(message);
        }

        if (!accountsResponse.ok) {
          const payload = (await accountsResponse.json().catch(() => ({}))) as {
            error?: unknown;
          };
          const message =
            typeof payload?.error === "string" && payload.error.trim()
              ? payload.error.trim()
              : "Failed to load accounts";
          throw new Error(message);
        }

        const categoriesPayload = (await categoriesResponse
          .json()
          .catch(() => ({}))) as { categories?: unknown };
        const accountsPayload = (await accountsResponse
          .json()
          .catch(() => ({}))) as { accounts?: unknown };

        const categoryList = (Array.isArray(categoriesPayload?.categories)
          ? categoriesPayload.categories
          : []
        )
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item) => normalizeCategory(item))
          .sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder;
            }

            return left.label.localeCompare(right.label);
          });

        const accountList = (Array.isArray(accountsPayload?.accounts)
          ? accountsPayload.accounts
          : []
        )
          .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
          .map((item) => normalizeAccount(item as Record<string, unknown>))
          .sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return left.sortOrder - right.sortOrder;
            }

            return left.name.localeCompare(right.name);
          });

        setCategories(categoryList);
        setAccounts(accountList);
        setStatus("ready");
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : "Failed to load metadata";
        setError(message);
        setStatus("error");
      }
    },
    [disabled, disabledMessage, spreadsheetId],
  );

  useEffect(() => {
    void loadMetadata();

    return () => {
      abortRef.current?.abort();
    };
  }, [loadMetadata]);

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.categoryId, category])),
    [categories],
  );

  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.accountId, account])),
    [accounts],
  );

  const categoryLabelsById = useMemo(
    () => new Map(categories.map((category) => [category.categoryId, category.label])),
    [categories],
  );

  const accountDisplayById = useMemo(
    () =>
      new Map(
        accounts.map((account) => [account.accountId, `${account.name} (${account.currency})`]),
      ),
    [accounts],
  );

  const incomeCategoryIds = useMemo<string[]>(
    () => [],
    [],
  );
  // TODO(issue-73): Restore income/expense segmentation when category data exposes
  // the new flow direction metadata.

  const expenseCategoryIds = useMemo(
    () => categories.map((category) => category.categoryId),
    [categories],
  );

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ id: category.categoryId, label: category.label })),
    [categories],
  );

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.accountId,
        name: account.name,
        currency: account.currency,
      })),
    [accounts],
  );

  const orphanDetails = useMemo(() => {
    const orphanEntries = new Map<string, { account: boolean; category: boolean }>();
    const orphanAccountIds = new Set<string>();
    const orphanCategoryIds = new Set<string>();

    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const { flowId, accountId, categoryId } = entry as LedgerEntryRef;
      if (!flowId) {
        continue;
      }

      const accountKey = accountId?.trim() || "";
      const categoryKey = categoryId?.trim() || "";

      const missingAccount = !accountKey || !accountsById.has(accountKey);
      const missingCategory = !categoryKey || !categoriesById.has(categoryKey);

      if (missingAccount || missingCategory) {
        orphanEntries.set(flowId, {
          account: missingAccount,
          category: missingCategory,
        });

        if (missingAccount && accountKey) {
          orphanAccountIds.add(accountKey);
        }

        if (missingCategory && categoryKey) {
          orphanCategoryIds.add(categoryKey);
        }
      }
    }

    return {
      entryLookup: orphanEntries,
      accountIds: Array.from(orphanAccountIds),
      categoryIds: Array.from(orphanCategoryIds),
    };
  }, [entries, accountsById, categoriesById]);

  return {
    status,
    blockingMessage,
    error,
    categories,
    accounts,
    categoriesById,
    accountsById,
    incomeCategoryIds,
    expenseCategoryIds,
    categoryLabelsById,
    accountDisplayById,
    categoryOptions,
    accountOptions,
    orphanAccountIds: orphanDetails.accountIds,
    orphanCategoryIds: orphanDetails.categoryIds,
    orphanEntryLookup: orphanDetails.entryLookup,
    reload: () => loadMetadata({ skipStatusReset: true }),
  };
}
