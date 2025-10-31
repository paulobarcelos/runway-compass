// ABOUTME: Renders a dropdown for choosing the global base currency.
// ABOUTME: Displays exchange-rate load status and error message when applicable.
"use client";

import { useBaseCurrency } from "./base-currency-context";

export function BaseCurrencySelector() {
  const {
    baseCurrency,
    setBaseCurrency,
    availableCurrencies,
    rateError,
    isLoadingRates,
    refreshRates,
  } = useBaseCurrency();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200/70 bg-white/70 p-4 text-sm shadow-sm shadow-zinc-900/5 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-200">
      <label className="flex items-center gap-2 font-medium" htmlFor="global-base-currency">
        Base currency
      </label>
      <select
        id="global-base-currency"
        value={baseCurrency}
        onChange={(event) => setBaseCurrency(event.target.value)}
        className="rounded-md border border-zinc-300/70 bg-white px-3 py-1 text-sm text-zinc-900 shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100"
      >
        {availableCurrencies.map((currency) => (
          <option key={currency} value={currency}>
            {currency}
          </option>
        ))}
      </select>
      {isLoadingRates ? (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Loading exchange rates…</span>
      ) : null}
      {rateError ? (
        <button
          type="button"
          onClick={() => void refreshRates()}
          className="text-xs text-rose-600 underline decoration-dotted underline-offset-4 dark:text-rose-300"
        >
          {rateError} — retry
        </button>
      ) : null}
    </div>
  );
}
