/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

test("normalizeAccountWarnings extracts rows and messages", async () => {
  const jiti = createJiti(__filename);
  const { normalizeAccountWarnings } = await jiti.import(
    "../src/components/accounts/account-diagnostics",
  );

  const result = normalizeAccountWarnings([
    { rowNumber: 5, message: "Missing account name" },
    { row: "7", message: "Currency is not supported" },
    { rowNumber: null, message: "Sheet is missing headers" },
    { rowNumber: 9, message: "   " },
    null,
  ]);

  assert.deepEqual(result, [
    { rowNumber: 5, message: "Missing account name" },
    { rowNumber: 7, message: "Currency is not supported" },
    { rowNumber: null, message: "Sheet is missing headers" },
  ]);
});

test("normalizeAccountWarnings returns empty array for non-array input", async () => {
  const jiti = createJiti(__filename);
  const { normalizeAccountWarnings } = await jiti.import(
    "../src/components/accounts/account-diagnostics",
  );

  assert.deepEqual(normalizeAccountWarnings(undefined), []);
  assert.deepEqual(normalizeAccountWarnings({}), []);
});
