// ABOUTME: Provides a deterministic spreadsheet health context for tests.
// ABOUTME: Enables simulations of blocking diagnostics without hitting APIs.
import React, { createContext, useContext } from "react";

type SpreadsheetHealthContextValue = {
  spreadsheetId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  diagnostics: Record<string, unknown> | null;
  issues: unknown[];
  error: string | null;
  lastFetchedAt: number | null;
  isFetching: boolean;
  reload: () => Promise<void>;
};

const defaultValue: SpreadsheetHealthContextValue = {
  spreadsheetId: null,
  status: "idle",
  diagnostics: null,
  issues: [],
  error: null,
  lastFetchedAt: null,
  isFetching: false,
  reload: async () => {},
};

const SpreadsheetHealthContext = createContext<SpreadsheetHealthContextValue | null>(
  defaultValue,
);

let currentValue: SpreadsheetHealthContextValue = { ...defaultValue };

export function __setSpreadsheetHealthTestValue(
  nextValue: Partial<SpreadsheetHealthContextValue>,
) {
  currentValue = { ...defaultValue, ...nextValue };
}

export function __resetSpreadsheetHealthTestValue() {
  currentValue = { ...defaultValue };
}

export function SpreadsheetHealthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return React.createElement(
    SpreadsheetHealthContext.Provider,
    { value: currentValue },
    children,
  );
}

export function useSpreadsheetHealth() {
  const context = useContext(SpreadsheetHealthContext);

  if (!context) {
    throw new Error("useSpreadsheetHealth must be used within SpreadsheetHealthProvider");
  }

  return context;
}
