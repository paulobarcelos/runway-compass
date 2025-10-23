// ABOUTME: Manages account list editing and snapshot capture workflows.
// ABOUTME: Loads accounts from Sheets, persists changes, and shows snapshot history.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { debugLog } from "@/lib/debug-log";
import { loadManifest, manifestStorageKey, type ManifestRecord } from "@/lib/manifest-store";
import { subscribeToManifestChange } from "@/lib/manifest-events";
import { useBaseCurrency } from "@/components/currency/base-currency-context";
import { useSpreadsheetHealth } from "@/components/spreadsheet/spreadsheet-health-context";
import {
  buildSheetUrl,
  filterSheetIssues,
  shouldRetryAfterRecovery,
  shouldReloadAfterBootstrap,
} from "@/components/spreadsheet/spreadsheet-health-helpers";

interface AccountDraft {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  includeInRunway: boolean;
  sortOrder: number;
  lastSnapshotAt: string | null;
}

interface SnapshotRecord {
  snapshotId: string;
  accountId: string;
  date: string;
  balance: number;
  note: string;
}

type LoadState = "idle" | "loading" | "error" | "ready";
type SaveState = "idle" | "saving";

const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "cash",
  "investment",
  "credit",
  "loan",
];

function createBlankAccount(baseCurrency: string, sortOrder: number): AccountDraft {
  const accountId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `acct-${Math.random().toString(36).slice(2)}`;

  return {
    accountId,
    name: "",
    type: "checking",
    currency: baseCurrency,
    includeInRunway: true,
    sortOrder,
    lastSnapshotAt: null,
  };
}

export function AccountsManager() {
  const [manifest, setManifest] = useState<ManifestRecord | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [original, setOriginal] = useState<AccountDraft[]>([]);
  const [drafts, setDrafts] = useState<AccountDraft[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [snapshotsError, setSnapshotsError] = useState<string | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  const {
    baseCurrency,
    availableCurrencies,
    convertAmount,
    formatAmount,
  } = useBaseCurrency();
  const { diagnostics: healthDiagnostics } = useSpreadsheetHealth();
  const accountsHealth = useMemo(
    () =>
      filterSheetIssues(healthDiagnostics, {
        sheetId: "accounts",
        fallbackTitle: "Accounts",
      }),
    [healthDiagnostics],
  );
  const snapshotsHealth = useMemo(
    () =>
      filterSheetIssues(healthDiagnostics, {
        sheetId: "snapshots",
        fallbackTitle: "Snapshots",
      }),
    [healthDiagnostics],
  );
  const hasAccountBlockingErrors = accountsHealth.hasErrors;
  const hasSnapshotBlockingErrors = snapshotsHealth.hasErrors;
  const hasBlockingErrors = hasAccountBlockingErrors;
  const snapshotActionsDisabled = hasAccountBlockingErrors || hasSnapshotBlockingErrors;
  const previousAccountErrorsRef = useRef(hasAccountBlockingErrors);
  const previousSnapshotErrorsRef = useRef(hasSnapshotBlockingErrors);
  const manifestStoredAt = manifest?.storedAt ?? null;
  const previousManifestStoredAtRef = useRef<number | null>(manifestStoredAt);

  const blockingMessage = useMemo(() => {
    if (hasAccountBlockingErrors) {
      return "Spreadsheet health flagged issues with the accounts tab. Fix the sheet problems above, then reload.";
    }

    if (loadState === "error" && loadError) {
      return loadError;
    }

    if (loadState === "error") {
      return "Accounts are temporarily unavailable. Try again after fixing the spreadsheet.";
    }

    return null;
  }, [hasAccountBlockingErrors, loadError, loadState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateManifest = () => {
      const stored = loadManifest(window.localStorage);
      setManifest(stored);
    };

    updateManifest();
    void debugLog("Accounts manager loaded manifest", loadManifest(window.localStorage));

    const unsubscribe = subscribeToManifestChange((record) => {
      setManifest(record);
    });

    const handleStorage = (event: StorageEvent) => {
      if (event.key === manifestStorageKey()) {
        updateManifest();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      unsubscribe();
    };
  }, []);

  const spreadsheetId = manifest?.spreadsheetId ?? null;
  const accountsSheetUrl = useMemo(
    () => buildSheetUrl(spreadsheetId, accountsHealth.sheetGid),
    [accountsHealth.sheetGid, spreadsheetId],
  );

  const isDirty = useMemo(() => {
    if (drafts.length !== original.length) {
      return true;
    }

    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const baseline = original[index];

      if (!baseline) {
        return true;
      }

      if (
        draft.accountId !== baseline.accountId ||
        draft.name !== baseline.name ||
        draft.type !== baseline.type ||
        draft.currency !== baseline.currency ||
        draft.includeInRunway !== baseline.includeInRunway ||
        draft.sortOrder !== baseline.sortOrder ||
        draft.lastSnapshotAt !== baseline.lastSnapshotAt
      ) {
        return true;
      }
    }

    return false;
  }, [drafts, original]);

  const fetchAccounts = useCallback(
    async (id: string) => {
      setLoadState("loading");
      setLoadError(null);

      try {
        const response = await fetch(`/api/accounts?spreadsheetId=${encodeURIComponent(id)}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            typeof payload?.error === "string" ? payload.error : "Failed to load accounts";
          throw new Error(message);
        }

        const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
        const normalized: AccountDraft[] = accounts.map((item: Record<string, unknown>) => ({
          accountId: String(item.accountId ?? "").trim(),
          name: String(item.name ?? "").trim(),
          type: String(item.type ?? "checking").trim() || "checking",
          currency: String(item.currency ?? baseCurrency).trim().toUpperCase() || baseCurrency,
          includeInRunway: Boolean(item.includeInRunway),
          sortOrder: (() => {
            if (typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)) {
              return item.sortOrder;
            }

            if (typeof item.sortOrder === "string" && item.sortOrder.trim()) {
              const parsed = Number.parseInt(item.sortOrder.trim(), 10);
              return Number.isFinite(parsed) ? parsed : 0;
            }

            return 0;
          })(),
          lastSnapshotAt:
            typeof item.lastSnapshotAt === "string" && item.lastSnapshotAt.trim()
              ? item.lastSnapshotAt.trim()
              : null,
        }));

        normalized.sort((left, right) => left.sortOrder - right.sortOrder);

        setOriginal(normalized.map((item: AccountDraft) => ({ ...item })));
        setDrafts(normalized);
        setLoadState("ready");
        setLastSavedAt(null);

        void debugLog("Loaded accounts", { count: normalized.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load accounts";
        setLoadState("error");
        setLoadError(message);
        void debugLog("Accounts load error", { message });
      }
    },
    [baseCurrency],
  );

  const fetchSnapshots = useCallback(
    async (id: string) => {
      setIsSnapshotLoading(true);
      setSnapshotsError(null);

      try {
        const response = await fetch(`/api/snapshots?spreadsheetId=${encodeURIComponent(id)}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            typeof payload?.error === "string" ? payload.error : "Failed to load snapshots";
          throw new Error(message);
        }

        const records = Array.isArray(payload?.snapshots) ? payload.snapshots : [];
        setSnapshots(
          records.map((item: Record<string, unknown>) => ({
            snapshotId: String(item.snapshotId ?? "").trim(),
            accountId: String(item.accountId ?? "").trim(),
            date: String(item.date ?? "").trim(),
            balance: Number(item.balance ?? 0),
            note: String(item.note ?? "").trim(),
          })),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load snapshots";
        setSnapshotsError(message);
        void debugLog("Snapshots load error", { message });
      } finally {
        setIsSnapshotLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!spreadsheetId) {
      setOriginal([]);
      setDrafts([]);
      setSnapshots([]);
      setLoadState("idle");
      setLoadError(null);
      return;
    }

    void fetchAccounts(spreadsheetId);
    void fetchSnapshots(spreadsheetId);
  }, [spreadsheetId, fetchAccounts, fetchSnapshots]);

  useEffect(() => {
    const previousStoredAt = previousManifestStoredAtRef.current;
    previousManifestStoredAtRef.current = manifestStoredAt;

    if (!spreadsheetId) {
      return;
    }

    if (shouldReloadAfterBootstrap(previousStoredAt, manifestStoredAt)) {
      void fetchAccounts(spreadsheetId);
      void fetchSnapshots(spreadsheetId);
    }
  }, [fetchAccounts, fetchSnapshots, manifestStoredAt, spreadsheetId]);

  useEffect(() => {
    if (hasAccountBlockingErrors || hasSnapshotBlockingErrors) {
      setActiveAccountId(null);
    }
  }, [hasAccountBlockingErrors, hasSnapshotBlockingErrors]);

  useEffect(() => {
    const previousAccountHasErrors = previousAccountErrorsRef.current;
    const previousSnapshotHasErrors = previousSnapshotErrorsRef.current;

    previousAccountErrorsRef.current = hasAccountBlockingErrors;
    previousSnapshotErrorsRef.current = hasSnapshotBlockingErrors;

    if (!spreadsheetId) {
      return;
    }

    const recoveredAccounts = shouldRetryAfterRecovery(
      previousAccountHasErrors,
      hasAccountBlockingErrors,
    );

    const recoveredSnapshots = shouldRetryAfterRecovery(
      previousSnapshotHasErrors,
      hasSnapshotBlockingErrors,
    );

    if (recoveredAccounts) {
      void fetchAccounts(spreadsheetId);
    }

    if (recoveredAccounts || recoveredSnapshots) {
      void fetchSnapshots(spreadsheetId);
    }
  }, [
    fetchAccounts,
    fetchSnapshots,
    hasAccountBlockingErrors,
    hasSnapshotBlockingErrors,
    spreadsheetId,
  ]);

  const handleAddAccount = useCallback(() => {
    if (hasBlockingErrors) {
      return;
    }

    setDrafts((current) => {
        const nextSortOrder =
          current.length > 0
            ? Math.max(...current.map((item: AccountDraft) => item.sortOrder)) + 1
            : 1;
      return [...current, createBlankAccount(baseCurrency, nextSortOrder)];
    });
  }, [baseCurrency, hasBlockingErrors]);

  const handleDelete = useCallback((accountId: string) => {
    if (hasBlockingErrors) {
      return;
    }

    setDrafts((current) => current.filter((item) => item.accountId !== accountId));
    setSnapshots((current) => current.filter((item) => item.accountId !== accountId));
  }, [hasBlockingErrors]);

  const handleFieldChange = useCallback(
    (accountId: string, field: keyof AccountDraft, value: string | boolean) => {
      if (hasBlockingErrors) {
        return;
      }

      setDrafts((current) =>
        current.map((account) => {
          if (account.accountId !== accountId) {
            return account;
          }

          if (field === "includeInRunway") {
            return { ...account, includeInRunway: Boolean(value) };
          }

          if (field === "currency") {
            return {
              ...account,
              currency: typeof value === "string" ? value.trim().toUpperCase() : account.currency,
            };
          }

          if (field === "sortOrder") {
            const parsed =
              typeof value === "string"
                ? Number.parseInt(value, 10)
                : typeof value === "number"
                  ? value
                  : account.sortOrder;

            return {
              ...account,
              sortOrder: Number.isFinite(parsed) ? parsed : account.sortOrder,
            };
          }

          if (typeof value === "string") {
            return { ...account, [field]: value };
          }

          return account;
        }),
      );
    },
    [hasBlockingErrors],
  );

  const handleReset = useCallback(() => {
    if (hasBlockingErrors) {
      return;
    }

    setDrafts(original.map((item: AccountDraft) => ({ ...item })));
    setSaveError(null);
    setLastSavedAt(null);
  }, [original, hasBlockingErrors]);

  const handleSave = useCallback(async () => {
    if (!spreadsheetId || drafts.length === 0 || hasBlockingErrors) {
      return;
    }

    setSaveError(null);
    setSaveState("saving");

    const payload = {
      accounts: drafts.map((account) => ({
        accountId: account.accountId,
        name: account.name.trim(),
        type: account.type.trim() || "checking",
        currency: account.currency.trim().toUpperCase() || baseCurrency,
        includeInRunway: account.includeInRunway,
        sortOrder: Number.isFinite(account.sortOrder) ? account.sortOrder : 0,
        lastSnapshotAt: account.lastSnapshotAt,
      })),
    };

    try {
      const response = await fetch(`/api/accounts?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof body?.error === "string" ? body.error : "Failed to save accounts";
        throw new Error(message);
      }

      const records = Array.isArray(body?.accounts) ? body.accounts : payload.accounts;

      const normalized = records
        .map((item: Record<string, unknown>) => ({
          accountId: String(item.accountId ?? "").trim(),
          name: String(item.name ?? "").trim(),
          type: String(item.type ?? "checking").trim() || "checking",
          currency: String(item.currency ?? baseCurrency).trim().toUpperCase() || baseCurrency,
          includeInRunway: Boolean(item.includeInRunway),
          sortOrder:
            typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
              ? item.sortOrder
              : 0,
          lastSnapshotAt:
            typeof item.lastSnapshotAt === "string" && item.lastSnapshotAt.trim()
              ? item.lastSnapshotAt.trim()
              : null,
        }))
        .sort((left: AccountDraft, right: AccountDraft) => {
          if (left.sortOrder === right.sortOrder) {
            return left.name.localeCompare(right.name);
          }

          return left.sortOrder - right.sortOrder;
        });

      setOriginal(normalized.map((item: AccountDraft) => ({ ...item })));
      setDrafts(normalized);

      const savedAt = new Date().toISOString();
      setLastSavedAt(savedAt);
      void debugLog("Accounts saved", { count: normalized.length, savedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save accounts";
      setSaveError(message);
      void debugLog("Accounts save error", { message });
    } finally {
      setSaveState("idle");
    }
  }, [drafts, spreadsheetId, baseCurrency, hasBlockingErrors]);

  const activeAccount = useMemo(
    () => drafts.find((account) => account.accountId === activeAccountId) ?? null,
    [drafts, activeAccountId],
  );

  const accountSnapshots = useMemo(
    () =>
      activeAccount
        ? snapshots
            .filter((snapshot) => snapshot.accountId === activeAccount.accountId)
            .sort((left, right) => right.date.localeCompare(left.date))
        : [],
    [activeAccount, snapshots],
  );

  const handleCaptureSnapshot = useCallback(
    async (account: AccountDraft, snapshot: { balance: string; date: string; note: string }) => {
      if (!spreadsheetId || snapshotActionsDisabled) {
        return;
      }

      const parsedBalance = Number.parseFloat(snapshot.balance);

      if (!Number.isFinite(parsedBalance)) {
        throw new Error("Snapshot balance must be a number");
      }

      const payload = {
        snapshot: {
          accountId: account.accountId,
          date: snapshot.date,
          balance: parsedBalance,
          note: snapshot.note,
        },
      };

      const response = await fetch(`/api/snapshots?spreadsheetId=${encodeURIComponent(spreadsheetId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = typeof body?.error === "string" ? body.error : "Failed to capture snapshot";
        throw new Error(message);
      }

      const stored = body.snapshot as SnapshotRecord;

      setSnapshots((current) => [...current, stored]);
      setDrafts((current) =>
        current.map((item: AccountDraft) =>
          item.accountId === account.accountId
            ? { ...item, lastSnapshotAt: stored.date }
            : item,
        ),
      );
      setOriginal((current) =>
        current.map((item: AccountDraft) =>
          item.accountId === account.accountId
            ? { ...item, lastSnapshotAt: stored.date }
            : item,
        ),
      );
    },
    [spreadsheetId, snapshotActionsDisabled],
  );

  if (!spreadsheetId) {
    return (
      <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
        Connect a spreadsheet to manage accounts.
      </section>
    );
  }

  if (loadState === "loading") {
    return (
      <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 text-sm text-zinc-600 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-300">
        Loading accounts…
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className="rounded-2xl border border-rose-200/70 bg-rose-50/80 p-6 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold">Accounts are temporarily unavailable.</h2>
            <p className="mt-1 text-sm">{blockingMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => spreadsheetId && void fetchAccounts(spreadsheetId)}
            className="self-start rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500"
          >
            Reload accounts
          </button>
          {accountsSheetUrl ? (
            <a
              href={accountsSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md border border-rose-300/70 bg-transparent px-4 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-700/60 dark:text-rose-100 dark:hover:bg-rose-900/40"
            >
              Open in Google Sheets
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Accounts</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Track balances across accounts and capture snapshots to keep projections grounded.
          </p>
        </div>
        {accountsSheetUrl ? (
          <a
            href={accountsSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Open in Google Sheets
          </a>
        ) : null}
      </div>

      {blockingMessage ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
          <p>{blockingMessage}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => spreadsheetId && void fetchAccounts(spreadsheetId)}
              className="inline-flex items-center rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500"
            >
              Reload accounts
            </button>
            {accountsSheetUrl ? (
              <a
                href={accountsSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-rose-300/70 bg-transparent px-4 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 dark:border-rose-700/60 dark:text-rose-100 dark:hover:bg-rose-900/40"
              >
                Open in Google Sheets
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {!hasAccountBlockingErrors && accountsHealth.warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200/60 bg-amber-50/70 p-4 text-xs text-amber-700 shadow-sm shadow-amber-900/10 dark:border-amber-500/60 dark:bg-amber-900/30 dark:text-amber-100">
          Heads-up: spreadsheet health lists non-blocking account warnings. Clearing them keeps imports reliable.
        </div>
      ) : null}

      {saveError && !hasAccountBlockingErrors ? (
        <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 p-4 text-sm text-rose-700 shadow-sm shadow-rose-900/10 dark:border-rose-700/60 dark:bg-rose-900/50 dark:text-rose-100">
          {saveError}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200/70 shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60">
        <table className="min-w-full divide-y divide-zinc-200/60 dark:divide-zinc-700/60">
          <thead className="bg-zinc-50/80 dark:bg-zinc-900/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2">Sort order</th>
              <th className="px-3 py-2">Include in runway</th>
              <th className="px-3 py-2">Last snapshot</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100/70 bg-white/80 text-sm dark:divide-zinc-800 dark:bg-zinc-900/70">
            {drafts.map((account) => (
              <tr key={account.accountId}>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={account.name}
                    onChange={(event) =>
                      handleFieldChange(account.accountId, "name", event.target.value)
                    }
                    placeholder="Account name"
                    disabled={hasBlockingErrors}
                    className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={account.type}
                    onChange={(event) =>
                      handleFieldChange(account.accountId, "type", event.target.value)
                    }
                    disabled={hasBlockingErrors}
                    className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={account.currency}
                    onChange={(event) =>
                      handleFieldChange(account.accountId, "currency", event.target.value)
                    }
                    disabled={hasBlockingErrors}
                    className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {availableCurrencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    step="1"
                    min={0}
                    value={account.sortOrder}
                    onChange={(event) =>
                      handleFieldChange(account.accountId, "sortOrder", event.target.value)
                    }
                    disabled={hasBlockingErrors}
                    className="w-full rounded-md border border-zinc-200/70 bg-white px-2 py-1 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </td>
                <td className="px-3 py-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={account.includeInRunway}
                      onChange={(event) =>
                        handleFieldChange(account.accountId, "includeInRunway", event.target.checked)
                      }
                      disabled={hasBlockingErrors}
                      className="h-4 w-4 rounded border border-zinc-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    Include
                  </label>
                </td>
                <td className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                  {account.lastSnapshotAt ? new Date(account.lastSnapshotAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveAccountId(account.accountId)}
                      disabled={snapshotActionsDisabled}
                      className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Capture snapshot
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(account.accountId)}
                      disabled={hasBlockingErrors}
                      className="inline-flex items-center rounded-md bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-rose-900/50 dark:text-rose-100 dark:hover:bg-rose-900"
                    >
                      Delete
                    </button>
                  </div>
                  {hasSnapshotBlockingErrors && !hasAccountBlockingErrors ? (
                    <p className="mt-2 text-right text-xs text-rose-600 dark:text-rose-300">
                      Snapshot capture is disabled until the snapshots tab passes health checks.
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddAccount}
            disabled={hasBlockingErrors}
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add account
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || saveState === "saving" || hasBlockingErrors}
            className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Reset changes
          </button>
        </div>

        <div className="flex items-center gap-3">
          {lastSavedAt ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Saved {new Date(lastSavedAt).toLocaleTimeString()}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => spreadsheetId && (void fetchAccounts(spreadsheetId), void fetchSnapshots(spreadsheetId))}
            disabled={saveState === "saving"}
            className="inline-flex items-center rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || saveState === "saving" || drafts.length === 0 || hasBlockingErrors}
            className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saveState === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {activeAccount && !snapshotActionsDisabled ? (
        <SnapshotModal
          account={activeAccount}
          snapshots={accountSnapshots}
          onClose={() => setActiveAccountId(null)}
          onCapture={handleCaptureSnapshot}
          convertAmount={convertAmount}
          formatAmount={formatAmount}
          baseCurrency={baseCurrency}
          isLoading={isSnapshotLoading}
          error={snapshotsError}
        />
      ) : null}
    </section>
  );
}

function SnapshotModal({
  account,
  snapshots,
  onClose,
  onCapture,
  convertAmount,
  formatAmount,
  baseCurrency,
  isLoading,
  error,
}: {
  account: AccountDraft;
  snapshots: SnapshotRecord[];
  onClose: () => void;
  onCapture: (
    account: AccountDraft,
    snapshot: {
      balance: string;
      date: string;
      note: string;
    },
  ) => Promise<void>;
  convertAmount: (amount: number, fromCurrency: string) => number | null;
  formatAmount: (amount: number, isApproximation?: boolean) => string;
  baseCurrency: string;
  isLoading: boolean;
  error: string | null;
}) {
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: account.currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [account.currency],
  );

  const normalizedSnapshots = useMemo(
    () =>
      snapshots.map((snapshot) => {
        const converted = convertAmount(snapshot.balance, account.currency);
        const approximate = account.currency.toUpperCase() !== baseCurrency.toUpperCase();
        return {
          ...snapshot,
          originalFormatted: accountCurrencyFormatter.format(snapshot.balance),
          normalized: converted == null ? null : formatAmount(converted, approximate),
        };
      }),
    [snapshots, convertAmount, account.currency, formatAmount, baseCurrency, accountCurrencyFormatter],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await onCapture(account, { balance, date, note });
      setBalance("");
      setNote("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to capture snapshot";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xl dark:border-zinc-700/60 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Capture snapshot — {account.name || "Unnamed account"}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Balances are stored in the account currency ({account.currency}).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300/70 bg-white px-2 py-1 text-xs font-semibold text-zinc-600 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
              Balance
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                required
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
                className="rounded-md border border-zinc-200/70 bg-white px-2 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
              Date
              <input
                type="date"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="rounded-md border border-zinc-200/70 bg-white px-2 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300 sm:col-span-1">
              Note
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional note"
                className="rounded-md border border-zinc-200/70 bg-white px-2 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>

          {submitError ? (
            <span className="text-xs text-rose-600 dark:text-rose-300">{submitError}</span>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving…" : "Save snapshot"}
            </button>
            {error ? (
              <span className="text-xs text-rose-600 dark:text-rose-300">{error}</span>
            ) : null}
          </div>
        </form>

        <div className="mt-6 max-h-60 overflow-y-auto rounded-lg border border-zinc-200/70 shadow-inner dark:border-zinc-700/60">
          <table className="min-w-full divide-y divide-zinc-200/60 text-sm dark:divide-zinc-700/60">
            <thead className="bg-zinc-50/80 dark:bg-zinc-900/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Balance ({account.currency})</th>
                <th className="px-3 py-2">Normalized ({baseCurrency})</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100/70 bg-white/80 dark:divide-zinc-800 dark:bg-zinc-900/70">
              {isLoading ? (
                <tr>
                  <td className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400" colSpan={4}>
                    Loading snapshots…
                  </td>
                </tr>
              ) : normalizedSnapshots.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400" colSpan={4}>
                    No snapshots captured yet.
                  </td>
                </tr>
              ) : (
                normalizedSnapshots.map((snapshot) => (
                  <tr key={snapshot.snapshotId}>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {snapshot.date ? new Date(snapshot.date).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {snapshot.originalFormatted}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {snapshot.normalized ?? "…"}
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{snapshot.note || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
