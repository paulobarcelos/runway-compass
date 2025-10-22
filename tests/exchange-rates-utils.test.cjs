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

test("loadExchangeRates returns parsed rates", async () => {
  const jiti = createTestJiti(__filename);
  const { loadExchangeRates, EXCHANGE_RATES_ENDPOINT } = await jiti.import(
    "../src/lib/exchange-rates",
  );

  const fetchCalls = [];

  const rates = await loadExchangeRates(async (input, init) => {
    fetchCalls.push({ input, init });
    return createResponse(200, { rates: { USD: 1, SEK: 10.5 } });
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, EXCHANGE_RATES_ENDPOINT);
  assert.deepEqual(rates, { USD: 1, SEK: 10.5 });
});

test("loadExchangeRates throws on missing rates", async () => {
  const jiti = createTestJiti(__filename);
  const { loadExchangeRates } = await jiti.import("../src/lib/exchange-rates");

  await assert.rejects(() => loadExchangeRates(async () => createResponse(200, { foo: "bar" })), /Missing rates/);
});

test("loadExchangeRates throws on non-ok response", async () => {
  const jiti = createTestJiti(__filename);
  const { loadExchangeRates } = await jiti.import("../src/lib/exchange-rates");

  await assert.rejects(() => loadExchangeRates(async () => createResponse(500, {})), /Failed to load/);
});
