import { convertCurrency, formatCurrency } from "@/lib/currency";

export interface FormatAmountWithBaseInput {
  amount: number | string | null | undefined;
  currency: string | null | undefined;
  baseCurrency: string;
  exchangeRates: Record<string, number> | null;
  isApproximation?: boolean;
}

export interface FormatAmountWithBaseResult {
  formattedAmount: string;
  baseAmount: number | null;
  formattedBaseAmount: string | null;
}

const normalizeCurrency = (code: string | null | undefined, fallback: string) => {
  const value = (code ?? fallback).trim();
  return value ? value.toUpperCase() : fallback.toUpperCase();
};

const coerceAmount = (amount: number | string | null | undefined): number | null => {
  if (amount === null || amount === undefined) {
    return null;
  }

  if (typeof amount === "number") {
    return Number.isFinite(amount) ? amount : null;
  }

  const trimmed = amount.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
};

export function formatAmountWithBase({
  amount,
  currency,
  baseCurrency,
  exchangeRates,
  isApproximation = false,
}: FormatAmountWithBaseInput): FormatAmountWithBaseResult {
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  const numericAmount = coerceAmount(amount);

  if (numericAmount === null) {
    return {
      formattedAmount: "",
      baseAmount: null,
      formattedBaseAmount: "",
    };
  }

  const normalizedCurrency = normalizeCurrency(currency, normalizedBaseCurrency);
  const formattedAmount = formatCurrency(numericAmount, normalizedCurrency, isApproximation);

  let baseAmount: number | null = null;
  let formattedBaseAmount: string | null = null;

  if (normalizedCurrency === normalizedBaseCurrency) {
    baseAmount = numericAmount;
    formattedBaseAmount = formatCurrency(baseAmount, normalizedBaseCurrency, isApproximation);
  } else if (exchangeRates) {
    try {
      baseAmount = convertCurrency(
        numericAmount,
        normalizedCurrency,
        normalizedBaseCurrency,
        exchangeRates,
      );
      formattedBaseAmount = formatCurrency(baseAmount, normalizedBaseCurrency, isApproximation);
    } catch {
      baseAmount = null;
      formattedBaseAmount = null;
    }
  }

  return {
    formattedAmount,
    baseAmount,
    formattedBaseAmount,
  };
}
