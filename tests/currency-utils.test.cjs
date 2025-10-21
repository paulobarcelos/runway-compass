/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

test("convertCurrency converts using USD base", async () => {
  const jiti = createJiti(__filename);
  const { convertCurrency } = await jiti.import("../src/lib/currency");

  const rates = {
    USD: 1,
    EUR: 0.9,
    SEK: 10.5,
  };

  const amount = convertCurrency(100, "EUR", "SEK", rates);

  // 100 EUR -> USD = 111.111..., * SEK rate
  assert.equal(Math.round(amount), 1167);
});

test("convertCurrency throws when rate missing", async () => {
  const jiti = createJiti(__filename);
  const { convertCurrency } = await jiti.import("../src/lib/currency");

  assert.throws(() =>
    convertCurrency(10, "EUR", "SEK", {
      USD: 1,
      EUR: 0.9,
    }),
  );
});

test("formatCurrency supports approximation flag", async () => {
  const jiti = createJiti(__filename);
  const { formatCurrency } = await jiti.import("../src/lib/currency");

  assert.equal(formatCurrency(1234.5, "USD"), "$1,234.50");
  assert.equal(formatCurrency(1234.5, "USD", true), "~$1,234.50");
});
