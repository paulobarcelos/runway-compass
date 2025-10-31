/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTestJiti } = require('./helpers/create-jiti');

test('formatAmountWithBase formats primary and base amounts when rates available', async () => {
  const jiti = createTestJiti(__filename);
  const { formatAmountWithBase } = await jiti.import('../src/lib/currency/formatters');

  const result = formatAmountWithBase({
    amount: 100,
    currency: 'EUR',
    baseCurrency: 'USD',
    exchangeRates: {
      USD: 1,
      EUR: 0.8,
      GBP: 0.7,
    },
  });

  assert.equal(result.formattedAmount, '€100.00');
  assert.ok(result.baseAmount);
  assert.equal(Math.round(result.baseAmount), 125);
  assert.equal(result.formattedBaseAmount, '$125.00');
});

test('formatAmountWithBase handles missing exchange rates gracefully', async () => {
  const jiti = createTestJiti(__filename);
  const { formatAmountWithBase } = await jiti.import('../src/lib/currency/formatters');

  const result = formatAmountWithBase({
    amount: 75,
    currency: 'JPY',
    baseCurrency: 'USD',
    exchangeRates: null,
  });

  assert.equal(result.formattedAmount, '¥75.00');
  assert.equal(result.baseAmount, null);
  assert.equal(result.formattedBaseAmount, null);
});

test('formatAmountWithBase returns empty strings for nullish amount', async () => {
  const jiti = createTestJiti(__filename);
  const { formatAmountWithBase } = await jiti.import('../src/lib/currency/formatters');

  const result = formatAmountWithBase({
    amount: null,
    currency: 'USD',
    baseCurrency: 'USD',
    exchangeRates: {
      USD: 1,
    },
  });

  assert.equal(result.formattedAmount, '');
  assert.equal(result.baseAmount, null);
  assert.equal(result.formattedBaseAmount, '');
});

test('formatAmountWithBase treats blank strings as empty amount', async () => {
  const jiti = createTestJiti(__filename);
  const { formatAmountWithBase } = await jiti.import('../src/lib/currency/formatters');

  const result = formatAmountWithBase({
    amount: '  ',
    currency: 'EUR',
    baseCurrency: 'USD',
    exchangeRates: {
      USD: 1,
      EUR: 0.9,
    },
  });

  assert.equal(result.formattedAmount, '');
  assert.equal(result.baseAmount, null);
  assert.equal(result.formattedBaseAmount, '');
});
