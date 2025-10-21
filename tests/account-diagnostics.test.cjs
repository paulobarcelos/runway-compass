/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

test("normalizeAccountWarnings extracts rows and messages with severity", async () => {
  const jiti = createJiti(__filename);
  const { normalizeAccountWarnings, isAccountWarning } = await jiti.import(
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
    { severity: "warning", rowNumber: 5, code: null, message: "Missing account name" },
    { severity: "warning", rowNumber: 7, code: null, message: "Currency is not supported" },
    { severity: "warning", rowNumber: null, code: null, message: "Sheet is missing headers" },
  ]);
  assert.ok(result.every(isAccountWarning));
});

test("normalizeAccountWarnings returns empty array for non-array input", async () => {
  const jiti = createJiti(__filename);
  const { normalizeAccountWarnings } = await jiti.import(
    "../src/components/accounts/account-diagnostics",
  );

  assert.deepEqual(normalizeAccountWarnings(undefined), []);
  assert.deepEqual(normalizeAccountWarnings({}), []);
});

test("normalizeAccountErrors extracts codes and messages", async () => {
  const jiti = createJiti(__filename);
  const { normalizeAccountErrors, isAccountError } = await jiti.import(
    "../src/components/accounts/account-diagnostics",
  );

  const result = normalizeAccountErrors([
    { code: "sheet_missing", message: "Accounts sheet is missing" },
    { code: "bad_headers", message: "Headers mismatch" },
    { code: "empty", message: "   " },
    { message: "No code" },
    "noop",
  ]);

  assert.deepEqual(result, [
    {
      severity: "error",
      rowNumber: null,
      code: "sheet_missing",
      message: "Accounts sheet is missing",
    },
    {
      severity: "error",
      rowNumber: null,
      code: "bad_headers",
      message: "Headers mismatch",
    },
    {
      severity: "error",
      rowNumber: null,
      code: null,
      message: "No code",
    },
  ]);
  assert.ok(result.every(isAccountError));
});
