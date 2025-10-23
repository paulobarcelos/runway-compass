// ABOUTME: Supplies a controllable base currency context for React tests.
// ABOUTME: Lets tests define conversion and formatting behavior deterministically.
import React, { createContext, useContext } from "react";

type BaseCurrencyContextValue = {
  baseCurrency: string;
  setBaseCurrency: (currency: string) => void;
  exchangeRates: Record<string, number> | null;
  isLoadingRates: boolean;
  rateError: string | null;
  availableCurrencies: string[];
  formatAmount: (amount: number, isApproximation?: boolean) => string;
  convertAmount: (amount: number, fromCurrency: string) => number | null;
  refreshRates: () => Promise<void>;
};

const defaultValue: BaseCurrencyContextValue = {
  baseCurrency: "USD",
  setBaseCurrency: () => {},
  exchangeRates: null,
  isLoadingRates: false,
  rateError: null,
  availableCurrencies: ["USD"],
  formatAmount: (amount: number, isApproximation?: boolean) =>
    `${isApproximation ? "~" : ""}${amount.toFixed(2)} USD`,
  convertAmount: (amount: number) => amount,
  refreshRates: async () => {},
};

const BaseCurrencyContext = createContext<BaseCurrencyContextValue | null>(defaultValue);

let currentValue: BaseCurrencyContextValue = { ...defaultValue };

export function __setBaseCurrencyTestValue(nextValue: Partial<BaseCurrencyContextValue>) {
  currentValue = { ...defaultValue, ...nextValue };
}

export function __resetBaseCurrencyTestValue() {
  currentValue = { ...defaultValue };
}

export function BaseCurrencyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return React.createElement(
    BaseCurrencyContext.Provider,
    { value: currentValue },
    children,
  );
}

export function useBaseCurrency() {
  const context = useContext(BaseCurrencyContext);

  if (!context) {
    throw new Error("useBaseCurrency must be used within BaseCurrencyProvider");
  }

  return context;
}
