// ABOUTME: Converts monetary amounts between currencies using USD-based rates.
// ABOUTME: Formats currency amounts for display with optional approximation flag.

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRates: Record<string, number>,
) {
  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number");
  }

  const fromCode = fromCurrency.toUpperCase();
  const toCode = toCurrency.toUpperCase();

  if (fromCode === toCode) {
    return amount;
  }

  const fromRate = exchangeRates[fromCode];
  const toRate = exchangeRates[toCode];

  if (typeof fromRate !== "number" || !Number.isFinite(fromRate)) {
    throw new Error(`Missing exchange rate for ${fromCode}`);
  }

  if (typeof toRate !== "number" || !Number.isFinite(toRate)) {
    throw new Error(`Missing exchange rate for ${toCode}`);
  }

  const amountInUSD = fromCode === "USD" ? amount : amount / fromRate;

  if (toCode === "USD") {
    return amountInUSD;
  }

  return amountInUSD * toRate;
}

export function formatCurrency(
  amount: number,
  currencyCode: string,
  isApproximation = false,
) {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formatted = formatter.format(amount);

  return isApproximation ? `~${formatted}` : formatted;
}
