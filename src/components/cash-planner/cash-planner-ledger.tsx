// ABOUTME: Renders the ledger table with inline editing and creation row.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBaseCurrency } from "@/components/currency/base-currency-context";
import type {
  CashFlowDraft,
  CashFlowEntry,
  CashFlowRecord,
  CashFlowStatus,
} from "@/server/google/repository/cash-flow-repository";

interface AccountOption {
  id: string;
  name: string;
  currency: string;
}

interface CategoryOption {
  id: string;
  label: string;
}

interface LedgerDraft {
  date: string;
  amount: string;
  status: CashFlowStatus;
  accountId: string;
  categoryId: string;
  note: string;
}

type NewEntryFieldKey = "date" | "amount" | "accountId" | "categoryId";

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

interface CashPlannerLedgerProps {
  entries: CashFlowRecord[];
  accounts: AccountOption[];
  categories: CategoryOption[];
  orphanInfo: Map<string, { account: boolean; category: boolean }>;
  onCreate: (draft: CashFlowDraft) => Promise<CashFlowRecord | null>;
  onUpdate: (flowId: string, updates: Partial<CashFlowEntry>) => Promise<CashFlowRecord | null>;
  onDelete: (flowId: string) => Promise<void>;
  isSaving: boolean;
}

function buildDraft(entry: CashFlowRecord): LedgerDraft {
  return {
    date: entry.date,
    amount: String(entry.amount),
    status: entry.status,
    accountId: entry.accountId,
    categoryId: entry.categoryId,
    note: entry.note,
  };
}

export function CashPlannerLedger({
  entries,
  accounts,
  categories,
  orphanInfo,
  onCreate,
  onUpdate,
  onDelete,
  isSaving,
}: CashPlannerLedgerProps) {
  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [
    accounts,
  ]);
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category.label])),
    [categories],
  );

  const [drafts, setDrafts] = useState<Map<string, LedgerDraft>>(new Map());
  const [newEntry, setNewEntry] = useState<LedgerDraft>({
    date: getTodayDate(),
    amount: "",
    status: "planned",
    accountId: "",
    categoryId: "",
    note: "",
  });
  const [newEntryError, setNewEntryError] = useState<string | null>(null);
  const [newEntryFieldErrors, setNewEntryFieldErrors] = useState<
    Partial<Record<NewEntryFieldKey, boolean>>
  >({});
  const lastUsedAccountIdRef = useRef<string>("");
  const lastUsedCategoryIdRef = useRef<string>("");

  const clearNewEntryFieldError = (field: NewEntryFieldKey) => {
    setNewEntryFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  useEffect(() => {
    const next = new Map<string, LedgerDraft>();
    for (const entry of entries) {
      next.set(entry.flowId, buildDraft(entry));
    }
    setDrafts(next);
  }, [entries]);

  const { baseCurrency, convertAmount, formatAmount } = useBaseCurrency();

  useEffect(() => {
    if (accounts.length === 0) {
      lastUsedAccountIdRef.current = "";
      setNewEntry((current) => (current.accountId ? { ...current, accountId: "" } : current));
      return;
    }

    if (!accounts.some((account) => account.id === lastUsedAccountIdRef.current)) {
      lastUsedAccountIdRef.current = accounts[0].id;
    }

    if (!newEntry.accountId || !accounts.some((account) => account.id === newEntry.accountId)) {
      const fallback = lastUsedAccountIdRef.current || accounts[0].id;
      if (newEntry.accountId !== fallback) {
        setNewEntry((current) => ({ ...current, accountId: fallback }));
        clearNewEntryFieldError("accountId");
      }
    }
  }, [accounts, newEntry.accountId]);

  useEffect(() => {
    if (categories.length === 0) {
      lastUsedCategoryIdRef.current = "";
      setNewEntry((current) => (current.categoryId ? { ...current, categoryId: "" } : current));
      return;
    }

    if (!categories.some((category) => category.id === lastUsedCategoryIdRef.current)) {
      lastUsedCategoryIdRef.current = categories[0].id;
    }

    if (
      !newEntry.categoryId ||
      !categories.some((category) => category.id === newEntry.categoryId)
    ) {
      const fallback = lastUsedCategoryIdRef.current || categories[0].id;
      if (newEntry.categoryId !== fallback) {
        setNewEntry((current) => ({ ...current, categoryId: fallback }));
        clearNewEntryFieldError("categoryId");
      }
    }
  }, [categories, newEntry.categoryId]);

  const handleDraftChange = (flowId: string, field: keyof LedgerDraft, value: string) => {
    setDrafts((current) => {
      const next = new Map(current);
      const draft = next.get(flowId);
      if (!draft) {
        return current;
      }

      next.set(flowId, { ...draft, [field]: value });
      return next;
    });
  };

  const applyUpdate = async (flowId: string) => {
    const original = entries.find((entry) => entry.flowId === flowId);
    const draft = drafts.get(flowId);

    if (!original || !draft) {
      return;
    }

    const updates: Partial<CashFlowEntry> = {};
    let changed = false;

    if (draft.date !== original.date) {
      updates.date = draft.date;
      changed = true;
    }

    if (draft.status !== original.status) {
      updates.status = draft.status;
      changed = true;
    }

    if (draft.accountId !== original.accountId) {
      updates.accountId = draft.accountId;
      changed = true;
    }

    if (draft.categoryId !== original.categoryId) {
      updates.categoryId = draft.categoryId;
      changed = true;
    }

    if (draft.note !== original.note) {
      updates.note = draft.note;
      changed = true;
    }

    if (draft.amount !== String(original.amount)) {
      const parsed = Number(draft.amount);
      if (!Number.isFinite(parsed)) {
        handleDraftChange(flowId, "amount", String(original.amount));
        return;
      }
      updates.amount = parsed;
      changed = true;
    }

    if (!changed) {
      return;
    }

    await onUpdate(flowId, updates);
  };

  const resetNewEntry = useCallback(() => {
    const defaultAccountId =
      lastUsedAccountIdRef.current || accounts[0]?.id || "";
    const defaultCategoryId =
      lastUsedCategoryIdRef.current || categories[0]?.id || "";

    if (defaultAccountId && !lastUsedAccountIdRef.current) {
      lastUsedAccountIdRef.current = defaultAccountId;
    }

    if (defaultCategoryId && !lastUsedCategoryIdRef.current) {
      lastUsedCategoryIdRef.current = defaultCategoryId;
    }

    setNewEntry({
      date: getTodayDate(),
      amount: "",
      status: "planned",
      accountId: defaultAccountId,
      categoryId: defaultCategoryId,
      note: "",
    });
    setNewEntryFieldErrors({});
    setNewEntryError(null);
  }, [accounts, categories]);

  const pushImmediateUpdate = async (
    flowId: string,
    updates: Partial<CashFlowEntry>,
  ) => {
    const original = entries.find((entry) => entry.flowId === flowId);

    if (!original) {
      return;
    }

    let changed = false;

    for (const [key, value] of Object.entries(updates)) {
      const typedKey = key as keyof CashFlowEntry;
      if (value !== undefined && value !== original[typedKey]) {
        changed = true;
        break;
      }
    }

    if (!changed) {
      return;
    }

    await onUpdate(flowId, updates);
  };

  const handleStatusChange = async (flowId: string, status: CashFlowStatus) => {
    handleDraftChange(flowId, "status", status);
    await pushImmediateUpdate(flowId, { status });
  };

  const handleAccountChange = async (flowId: string, accountId: string) => {
    handleDraftChange(flowId, "accountId", accountId);
    await pushImmediateUpdate(flowId, { accountId });
  };

  const handleCategoryChange = async (flowId: string, categoryId: string) => {
    handleDraftChange(flowId, "categoryId", categoryId);
    await pushImmediateUpdate(flowId, { categoryId });
  };

  const handleBlur = async (flowId: string, field: keyof LedgerDraft) => {
    const draft = drafts.get(flowId);
    if (!draft) {
      return;
    }

    if (field === "amount" && draft.amount.trim() === "") {
      const original = entries.find((entry) => entry.flowId === flowId);
      if (original) {
        handleDraftChange(flowId, "amount", String(original.amount));
      }
      return;
    }

    await applyUpdate(flowId);
  };

  const handleNewEntryAccountChange = (value: string) => {
    clearNewEntryFieldError("accountId");
    if (value) {
      lastUsedAccountIdRef.current = value;
    }
    setNewEntry((current) => ({ ...current, accountId: value }));
  };

  const handleNewEntryCategoryChange = (value: string) => {
    clearNewEntryFieldError("categoryId");
    if (value) {
      lastUsedCategoryIdRef.current = value;
    }
    setNewEntry((current) => ({ ...current, categoryId: value }));
  };

  const handleCreate = async () => {
    const trimmedDate = newEntry.date.trim();
    const trimmedAmount = newEntry.amount.trim();
    const trimmedAccount = newEntry.accountId.trim();
    const trimmedCategory = newEntry.categoryId.trim();

    const fieldErrors: Partial<Record<NewEntryFieldKey, boolean>> = {};

    if (!trimmedDate) {
      fieldErrors.date = true;
    }

    if (!trimmedAccount) {
      fieldErrors.accountId = true;
    }

    if (!trimmedCategory) {
      fieldErrors.categoryId = true;
    }

    if (!trimmedAmount) {
      fieldErrors.amount = true;
    } else {
      const parsed = Number(trimmedAmount);
      if (!Number.isFinite(parsed)) {
        const nextErrors = { ...fieldErrors, amount: true };
        setNewEntryFieldErrors(nextErrors);
        setNewEntryError("Amount must be a valid number.");
        return;
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      setNewEntryFieldErrors(fieldErrors);
      setNewEntryError("Fill out date, amount, account, and category before adding an entry.");
      return;
    }

    setNewEntryFieldErrors({});
    setNewEntryError(null);

    const draft: CashFlowDraft = {
      date: trimmedDate,
      amount: Number(trimmedAmount),
      status: newEntry.status,
      accountId: trimmedAccount,
      categoryId: trimmedCategory,
      note: newEntry.note.trim(),
    };

    const created = await onCreate(draft);
    if (created) {
      lastUsedAccountIdRef.current = draft.accountId;
      lastUsedCategoryIdRef.current = draft.categoryId;
      resetNewEntry();
    }
  };

  const newEntryAccount = accountMap.get(newEntry.accountId) ?? null;
  const newEntryCurrency = newEntryAccount?.currency ?? "";
  const newEntryAmountNumber = Number(newEntry.amount);
  const newEntryHasAmount =
    newEntry.amount.trim() !== "" && Number.isFinite(newEntryAmountNumber);
  const newEntryConvertedAmount =
    newEntryAccount && newEntryHasAmount
      ? convertAmount(newEntryAmountNumber, newEntryAccount.currency)
      : null;
  const showInlineError = Boolean(newEntryError);
  const newEntryRowTint =
    newEntryHasAmount && newEntryAmountNumber !== 0
      ? newEntryAmountNumber >= 0
        ? "bg-emerald-50/70 dark:bg-emerald-900/10"
        : "bg-rose-50/70 dark:bg-rose-900/20"
      : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-xl border border-zinc-200/70 bg-white/80 shadow-sm dark:border-zinc-700/60 dark:bg-zinc-900/70">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
          <thead className="bg-zinc-50/80 dark:bg-zinc-900/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Account</th>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Amount ({baseCurrency})</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            <tr
              className={`text-sm text-zinc-700 dark:text-zinc-200 ${newEntryRowTint}`}
            >
              <td className="px-3 py-2">
                <select
                  className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs dark:border-emerald-700 dark:bg-zinc-900"
                  value={newEntry.status}
                  onChange={(event) =>
                    setNewEntry((current) => ({ ...current, status: event.target.value as CashFlowStatus }))
                  }
                  disabled={isSaving}
                >
                  <option value="planned">Planned</option>
                  <option value="posted">Posted</option>
                </select>
              </td>
              <td className="px-3 py-2">
                <input
                  type="date"
                  className={`w-full rounded px-2 py-1 text-xs border bg-white dark:bg-zinc-900 ${
                    newEntryFieldErrors.date
                      ? "border-rose-400 focus-visible:outline-rose-500 dark:border-rose-500"
                      : "border-emerald-200 dark:border-emerald-700"
                  }`}
                  value={newEntry.date}
                  onChange={(event) => {
                    clearNewEntryFieldError("date");
                    setNewEntry((current) => ({ ...current, date: event.target.value }));
                  }}
                  disabled={isSaving}
                />
              </td>
              <td className="px-3 py-2">
                <select
                  className={`w-full rounded px-2 py-1 text-xs border bg-white dark:bg-zinc-900 ${
                    newEntryFieldErrors.categoryId
                      ? "border-rose-400 focus-visible:outline-rose-500 dark:border-rose-500"
                      : "border-emerald-200 dark:border-emerald-700"
                  }`}
                  value={newEntry.categoryId}
                  onChange={(event) => handleNewEntryCategoryChange(event.target.value)}
                  disabled={isSaving}
                >
                  <option value="">Select category…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <select
                  className={`w-full rounded px-2 py-1 text-xs border bg-white dark:bg-zinc-900 ${
                    newEntryFieldErrors.accountId
                      ? "border-rose-400 focus-visible:outline-rose-500 dark:border-rose-500"
                      : "border-emerald-200 dark:border-emerald-700"
                  }`}
                  value={newEntry.accountId}
                  onChange={(event) => handleNewEntryAccountChange(event.target.value)}
                  disabled={isSaving}
                >
                  <option value="">Select account…</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.currency})
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                {newEntryCurrency || "—"}
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  step="0.01"
                  className={`w-full rounded px-2 py-1 text-xs border bg-white dark:bg-zinc-900 ${
                    newEntryFieldErrors.amount
                      ? "border-rose-400 focus-visible:outline-rose-500 dark:border-rose-500"
                      : "border-emerald-200 dark:border-emerald-700"
                  }`}
                  value={newEntry.amount}
                  onChange={(event) => {
                    clearNewEntryFieldError("amount");
                    setNewEntry((current) => ({ ...current, amount: event.target.value }));
                  }}
                  disabled={isSaving}
                />
              </td>
              <td className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                {newEntryAccount && newEntryHasAmount && newEntryConvertedAmount !== null
                  ? formatAmount(
                      newEntryConvertedAmount,
                      newEntryAccount.currency.toUpperCase() !== baseCurrency.toUpperCase(),
                    )
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  placeholder="Optional note"
                  className="w-full rounded border border-emerald-200 px-2 py-1 text-xs dark:border-emerald-700 dark:bg-zinc-900"
                  value={newEntry.note}
                  onChange={(event) =>
                    setNewEntry((current) => ({ ...current, note: event.target.value }))
                  }
                  disabled={isSaving}
                />
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleCreate}
                  disabled={isSaving}
                >
                  Add
                </button>
              </td>
            </tr>
            {showInlineError ? (
              <tr className="text-xs text-rose-600 dark:text-rose-400">
                <td className="px-3 pb-3" colSpan={9}>
                  {newEntryError}
                </td>
              </tr>
            ) : null}
            {entries.map((entry) => {
              const draft = drafts.get(entry.flowId) ?? buildDraft(entry);
              const account = accountMap.get(draft.accountId);
              const amountNumber = Number(draft.amount);
              const amountValid = Number.isFinite(amountNumber);

              const orphanFlags = orphanInfo.get(entry.flowId) ?? { account: false, category: false };
              const rowIsOrphan = orphanFlags.account || orphanFlags.category;

              const hasAccountOption = accountMap.has(draft.accountId);
              const accountSelectOptions = hasAccountOption
                ? accounts
                : draft.accountId
                ? [{ id: draft.accountId, name: "Missing account", currency: "" }, ...accounts]
                : accounts;

              const hasCategoryOption = categoryMap.has(draft.categoryId);
              const categorySelectOptions = hasCategoryOption
                ? categories
                : draft.categoryId
                ? [{ id: draft.categoryId, label: "Missing category" }, ...categories]
                : categories;

              let baseDisplay = "—";
              if (account && amountValid) {
                const converted = convertAmount(amountNumber, account.currency);
                if (converted !== null) {
                  baseDisplay = formatAmount(
                    converted,
                    account.currency.toUpperCase() !== baseCurrency.toUpperCase(),
                  );
                }
              }

              const rowToneClass =
                amountValid && amountNumber !== 0
                  ? amountNumber >= 0
                    ? "bg-emerald-50/70 dark:bg-emerald-900/10"
                    : "bg-rose-50/70 dark:bg-rose-900/20"
                  : "";
              const rowClass = [
                "text-sm text-zinc-700 dark:text-zinc-200",
                rowToneClass,
              ];
              if (rowIsOrphan) {
                rowClass.push("outline outline-1 outline-amber-400 dark:outline-amber-500");
              }

              const accountCurrency = account?.currency ?? "—";
              const convertedAmountClass = amountValid
                ? amountNumber >= 0
                  ? "text-emerald-600"
                  : "text-rose-600"
                : "text-zinc-400 dark:text-zinc-500";

              return (
                <tr key={entry.flowId} className={rowClass.join(" ")}>
                  <td className="px-3 py-2 align-top">
                    <select
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      value={draft.status}
                      onChange={(event) =>
                        void handleStatusChange(entry.flowId, event.target.value as CashFlowStatus)
                      }
                      disabled={isSaving}
                    >
                      <option value="planned">Planned</option>
                      <option value="posted">Posted</option>
                    </select>
                    {rowIsOrphan ? (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-500 text-[10px]">
                          !
                        </span>
                        Metadata missing
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="date"
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      value={draft.date}
                      onChange={(event) => handleDraftChange(entry.flowId, "date", event.target.value)}
                      onBlur={() => void handleBlur(entry.flowId, "date")}
                      disabled={isSaving}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      value={draft.categoryId}
                      onChange={(event) => void handleCategoryChange(entry.flowId, event.target.value)}
                      disabled={isSaving}
                    >
                      {categorySelectOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    {orphanFlags.category ? (
                      <div className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                        Category removed. Select another option.
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      value={draft.accountId}
                      onChange={(event) => void handleAccountChange(entry.flowId, event.target.value)}
                      disabled={isSaving}
                    >
                      {accountSelectOptions.map((accountOption) => (
                        <option key={accountOption.id} value={accountOption.id}>
                          {accountOption.name}
                          {accountOption.currency ? ` (${accountOption.currency})` : ""}
                        </option>
                      ))}
                    </select>
                    {orphanFlags.account ? (
                      <div className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">
                        Account removed. Select another option.
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-zinc-500 dark:text-zinc-400">
                    {accountCurrency}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="number"
                      step="0.01"
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      value={draft.amount}
                      onChange={(event) => handleDraftChange(entry.flowId, "amount", event.target.value)}
                      onBlur={() => void handleBlur(entry.flowId, "amount")}
                      disabled={isSaving}
                    />
                  </td>
                  <td className={`px-3 py-2 align-top text-xs font-semibold ${convertedAmountClass}`}>
                    {baseDisplay}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      type="text"
                      placeholder="Optional note"
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      value={draft.note}
                      onChange={(event) => handleDraftChange(entry.flowId, "note", event.target.value)}
                      onBlur={() => void handleBlur(entry.flowId, "note")}
                      disabled={isSaving}
                    />
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <button
                      type="button"
                      className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      onClick={() => void onDelete(entry.flowId)}
                      disabled={isSaving}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showInlineError ? null : newEntryError ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{newEntryError}</p>
      ) : null}
    </div>
  );
}
