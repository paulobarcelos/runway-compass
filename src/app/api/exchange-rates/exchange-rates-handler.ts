// ABOUTME: Shared exchange rate handler with injectable fetch for tests.
// ABOUTME: Applies caching headers and resilient fallback behaviour.
import { NextResponse } from "next/server";

const OPEN_EXCHANGE_RATES_API = "https://open.exchangerate-api.com/v6/latest";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
} as const;

const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 148.0,
  AUD: 1.52,
  CAD: 1.35,
  CHF: 0.87,
  CNY: 7.19,
  BRL: 5.0,
};

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function extractRates(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate =
    (payload as Record<string, unknown>).rates ??
    (payload as Record<string, unknown>).conversion_rates;

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const entries = Object.entries(candidate).filter(
    ([, value]) => typeof value === "number" && Number.isFinite(value),
  );

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
}

export function createExchangeRatesHandler(fetchFn: FetchFn = fetch) {
  return async function GET() {
    try {
      const response = await fetchFn(OPEN_EXCHANGE_RATES_API);

      if (!response.ok) {
        throw new Error(`Exchange rate API responded with ${response.status}`);
      }

      const data = await response.json();
      const rates = extractRates(data);

      if (!rates) {
        throw new Error("Missing rates payload");
      }

      return NextResponse.json(
        { rates },
        {
          headers: CACHE_HEADERS,
        },
      );
    } catch (error) {
      console.error("Failed to fetch exchange rates:", error);

      return NextResponse.json(
        { rates: FALLBACK_RATES },
        {
          headers: CACHE_HEADERS,
          status: 200,
        },
      );
    }
  };
}

export { FALLBACK_RATES };
