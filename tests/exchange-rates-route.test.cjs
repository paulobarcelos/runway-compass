/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function createResponse(status, json) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return json;
    },
  };
}

test("exchange rates route returns fetched rates with caching headers", async () => {
  const jiti = createTestJiti(__filename);
  const { createExchangeRatesHandler } = await jiti.import(
    "../src/app/api/exchange-rates/exchange-rates-handler",
  );

  const fetchCalls = [];

  const handler = createExchangeRatesHandler(async (input, init) => {
    fetchCalls.push({ input, init });
    return createResponse(200, {
      conversion_rates: {
        USD: 1,
        SEK: 10.5,
      },
    });
  });

  const response = await handler();
  const payload = await response.json();

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, "https://open.exchangerate-api.com/v6/latest");
  assert.deepEqual(payload, {
    rates: {
      USD: 1,
      SEK: 10.5,
    },
  });
  assert.equal(
    response.headers.get("cache-control"),
    "public, s-maxage=3600, stale-while-revalidate=86400",
  );
});

test("exchange rates route falls back on error", async () => {
  const jiti = createTestJiti(__filename);
  const { createExchangeRatesHandler, FALLBACK_RATES } = await jiti.import(
    "../src/app/api/exchange-rates/exchange-rates-handler",
  );

  const originalError = console.error;
  console.error = () => {};

  try {
    const handler = createExchangeRatesHandler(async () => {
      throw new Error("network failure");
    });

    const response = await handler();
    const payload = await response.json();

    assert.deepEqual(payload, { rates: FALLBACK_RATES });
  } finally {
    console.error = originalError;
  }
});

test("exchange rates route falls back when payload missing rates", async () => {
  const jiti = createTestJiti(__filename);
  const { createExchangeRatesHandler, FALLBACK_RATES } = await jiti.import(
    "../src/app/api/exchange-rates/exchange-rates-handler",
  );

  const originalError = console.error;
  console.error = () => {};

  try {
    const handler = createExchangeRatesHandler(async () => createResponse(200, { foo: "bar" }));

    const response = await handler();
    const payload = await response.json();

    assert.deepEqual(payload, { rates: FALLBACK_RATES });
  } finally {
    console.error = originalError;
  }
});
