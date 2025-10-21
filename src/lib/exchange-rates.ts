// ABOUTME: Loads cached exchange rates from the app API with validation.
// ABOUTME: Exposes helper for client components to request rate data.

const EXCHANGE_RATES_ENDPOINT = "/api/exchange-rates";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadExchangeRates(fetchFn: FetchLike = fetch) {
  const response = await fetchFn(EXCHANGE_RATES_ENDPOINT, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to load exchange rates: ${response.status}`);
  }

  const payload = await response.json().catch(() => null);

  if (!payload || typeof payload !== "object") {
    throw new Error("Malformed exchange rate payload");
  }

  const rates = (payload as Record<string, unknown>).rates;

  if (!rates || typeof rates !== "object") {
    throw new Error("Missing rates in exchange rate payload");
  }

  const result: Record<string, number> = {};

  for (const [code, value] of Object.entries(rates)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      result[code] = value;
    }
  }

  if (Object.keys(result).length === 0) {
    throw new Error("Exchange rate payload contains no numeric entries");
  }

  return result;
}

export { EXCHANGE_RATES_ENDPOINT };
