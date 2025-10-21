// ABOUTME: Provides base currency state and exchange rate helpers for the app.
// ABOUTME: Persists the selected currency and exposes conversion utilities.
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { loadExchangeRates } from "@/lib/exchange-rates";
import { convertCurrency, formatCurrency } from "@/lib/currency";

const BASE_CURRENCY_STORAGE_KEY = "runway-compass:base-currency";

interface BaseCurrencyContextValue {
  baseCurrency: string;
  setBaseCurrency: (currency: string) => void;
  exchangeRates: Record<string, number> | null;
  isLoadingRates: boolean;
  rateError: string | null;
  availableCurrencies: string[];
  formatAmount: (amount: number, isApproximation?: boolean) => string;
  convertAmount: (amount: number, fromCurrency: string) => number | null;
  refreshRates: () => Promise<void>;
}

const BaseCurrencyContext = createContext<BaseCurrencyContextValue | undefined>(undefined);

export function BaseCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [baseCurrency, setBaseCurrencyState] = useState("USD");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null);
  const [isLoadingRates, setIsLoadingRates] = useState(true);
  const [rateError, setRateError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage
      .getItem(BASE_CURRENCY_STORAGE_KEY)
      ?.trim()
      .toUpperCase();

    if (stored) {
      setBaseCurrencyState(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(BASE_CURRENCY_STORAGE_KEY, baseCurrency);
  }, [baseCurrency]);

  const refreshRates = async () => {
    try {
      setIsLoadingRates(true);
      const rates = await loadExchangeRates();
      setExchangeRates(rates);
      setRateError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load exchange rates";
      setExchangeRates(null);
      setRateError(message);
    } finally {
      setIsLoadingRates(false);
    }
  };

  useEffect(() => {
    void refreshRates();
  }, []);

  const availableCurrencies = useMemo(() => {
    if (!exchangeRates) {
      return [baseCurrency];
    }

    const codes = new Set<string>();

    for (const code of Object.keys(exchangeRates)) {
      codes.add(code.toUpperCase());
    }

    codes.add(baseCurrency.toUpperCase());

    return Array.from(codes).sort();
  }, [exchangeRates, baseCurrency]);

  const convertAmount = (amount: number, fromCurrency: string) => {
    if (!exchangeRates) {
      return null;
    }

    const source = fromCurrency.trim().toUpperCase();
    const target = baseCurrency.toUpperCase();

    try {
      return convertCurrency(amount, source, target, exchangeRates);
    } catch {
      return null;
    }
  };

  const formatAmount = (amount: number, isApproximation = false) =>
    formatCurrency(amount, baseCurrency, isApproximation);

  const value: BaseCurrencyContextValue = {
    baseCurrency,
    setBaseCurrency: (code) => setBaseCurrencyState(code.trim().toUpperCase()),
    exchangeRates,
    isLoadingRates,
    rateError,
    availableCurrencies,
    convertAmount,
    formatAmount,
    refreshRates,
  };

  return <BaseCurrencyContext.Provider value={value}>{children}</BaseCurrencyContext.Provider>;
}

export function useBaseCurrency() {
  const context = useContext(BaseCurrencyContext);

  if (!context) {
    throw new Error("useBaseCurrency must be used within BaseCurrencyProvider");
  }

  return context;
}
