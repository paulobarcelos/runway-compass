// ABOUTME: Controlled input for monetary amounts with currency selector and base preview.
"use client";

import {
  type ChangeEventHandler,
  type FocusEventHandler,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { useBaseCurrency } from "@/components/currency/base-currency-context";

export interface MoneyInputChange {
  amount: number | null;
  currency: string;
}

export interface MoneyInputProps {
  value: number | null | undefined;
  currency?: string | null;
  onChange: (next: MoneyInputChange) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  disabled?: boolean;
  allowCurrencyChange?: boolean;
  showBasePreview?: boolean;
  label?: string;
  id?: string;
  ariaDescribedBy?: string;
  className?: string;
  inputClassName?: string;
  selectClassName?: string;
  basePreviewClassName?: string;
}

function formatAmountText(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function normalizeCurrency(code: string, fallback: string) {
  const trimmed = code.trim();
  return trimmed ? trimmed.toUpperCase() : fallback.toUpperCase();
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/,/g, "");
  const numeric = Number(normalized);

  return Number.isFinite(numeric) ? numeric : null;
}

export function MoneyInput({
  value,
  currency,
  onChange,
  onBlur,
  disabled = false,
  allowCurrencyChange = true,
  showBasePreview = false,
  label,
  id,
  ariaDescribedBy,
  className,
  inputClassName,
  selectClassName,
  basePreviewClassName,
}: MoneyInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const {
    baseCurrency,
    availableCurrencies,
    formatAmountWithBase,
  } = useBaseCurrency();

  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  const currentCurrency = normalizeCurrency(currency ?? baseCurrency, baseCurrency);

  const [amountText, setAmountText] = useState(() => formatAmountText(value));

  useEffect(() => {
    setAmountText(formatAmountText(value));
  }, [value]);

  const currencyOptions = useMemo(() => {
    const next = new Set<string>();
    next.add(baseCurrency.toUpperCase());
    for (const code of availableCurrencies) {
      next.add(code.toUpperCase());
    }
    next.add(currentCurrency);
    return Array.from(next.values()).sort();
  }, [availableCurrencies, baseCurrency, currentCurrency]);

  const handleAmountChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextValue = event.target.value;
    setAmountText(nextValue);

    onChange({
      amount: parseAmount(nextValue),
      currency: currentCurrency,
    });
  };

  const handleCurrencyChange: ChangeEventHandler<HTMLSelectElement> = (event) => {
    const nextCurrency = normalizeCurrency(event.target.value, baseCurrency);

    onChange({
      amount: parseAmount(amountText),
      currency: nextCurrency,
    });
  };

  const basePreview = useMemo(() => {
    if (!showBasePreview) {
      return null;
    }

    if (currentCurrency === normalizedBaseCurrency) {
      return null;
    }

    const preview = formatAmountWithBase(amountText, currentCurrency);

    if (!preview?.formattedBaseAmount || preview.baseAmount === null) {
      return null;
    }

    return `~${preview.formattedBaseAmount}`;
  }, [amountText, currentCurrency, formatAmountWithBase, normalizedBaseCurrency, showBasePreview]);

  return (
    <div className={className ? `flex flex-col gap-2 ${className}` : "flex flex-col gap-2"}>
      {label ? (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
        >
          {label}
        </label>
      ) : null}
      <div className="flex gap-2">
        <select
          className={`min-w-[5.5rem] rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-sm text-zinc-900 text-right shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800${selectClassName ? ` ${selectClassName}` : ""}`}
          value={currentCurrency}
          onChange={handleCurrencyChange}
          disabled={disabled || !allowCurrencyChange}
          aria-label="Currency"
        >
          {currencyOptions.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          className={`flex-1 rounded-md border border-zinc-300/70 bg-white px-3 py-2 text-right text-sm text-zinc-900 shadow-sm focus:accent-border-strong focus:outline-none focus:ring-2 focus:accent-ring-soft disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500 dark:border-zinc-700/60 dark:bg-zinc-900 dark:text-zinc-100 dark:disabled:bg-zinc-800${inputClassName ? ` ${inputClassName}` : ""}`}
          value={amountText}
          onChange={handleAmountChange}
          onBlur={onBlur}
          aria-describedby={ariaDescribedBy}
          disabled={disabled}
        />
      </div>
      {basePreview ? (
        <p
          data-testid="money-input-base-preview"
          className={`text-right text-xs text-zinc-500 dark:text-zinc-400${basePreviewClassName ? ` ${basePreviewClassName}` : ""}`}
          aria-live="polite"
        >
          {basePreview}
        </p>
      ) : null}
    </div>
  );
}
