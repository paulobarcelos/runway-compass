/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

test("budget horizon route requires spreadsheetId", async () => {
  const jiti = createTestJiti(__filename);
  const { createBudgetHorizonHandler } = await jiti.import(
    "../src/app/api/budget-horizon/horizon/budget-horizon-handler",
  );

  const { POST } = createBudgetHorizonHandler({
    applyHorizon: async () => {
      throw new Error("should not be called");
    },
  });

  const request = new Request("http://localhost/api/budget-horizon/horizon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "expand", meta: { start: "2025-01-01", months: 12 } }),
  });

  const response = await POST(request);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Missing spreadsheetId");
});

test("budget horizon route validates action and metadata", async () => {
  const jiti = createTestJiti(__filename);
  const { createBudgetHorizonHandler } = await jiti.import(
    "../src/app/api/budget-horizon/horizon/budget-horizon-handler",
  );

  const { POST } = createBudgetHorizonHandler({
    applyHorizon: async () => {
      throw new Error("should not be called");
    },
  });

  const request = new Request(
    "http://localhost/api/budget-horizon/horizon?spreadsheetId=sheet-123",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invalid", meta: { start: "2025-01-01", months: 12 } }),
    },
  );

  const response = await POST(request);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error, "Invalid action");
});

test("budget horizon route applies action and returns payload", async () => {
  const jiti = createTestJiti(__filename);
  const { createBudgetHorizonHandler } = await jiti.import(
    "../src/app/api/budget-horizon/horizon/budget-horizon-handler",
  );

  const calls = [];

  const { POST } = createBudgetHorizonHandler({
    applyHorizon: async ({ spreadsheetId, action, metadata }) => {
      calls.push({ spreadsheetId, action, metadata });
      return {
        metadata,
        records: [
          {
            recordId: "rec-1",
            categoryId: "cat-1",
            month: 1,
            year: 2025,
            amount: 100,
            currency: "USD",
            rolloverBalance: 0,
          },
        ],
      };
    },
  });

  const request = new Request(
    "http://localhost/api/budget-horizon/horizon?spreadsheetId=sheet-abc",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "expand", meta: { start: "2025-01-01", months: 6 } }),
    },
  );

  const response = await POST(request);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      spreadsheetId: "sheet-abc",
      action: "expand",
      metadata: { start: "2025-01-01", months: 6 },
    },
  ]);
  assert.deepEqual(payload, {
    budgetPlan: [
      {
        recordId: "rec-1",
        categoryId: "cat-1",
        month: 1,
        year: 2025,
        amount: 100,
        currency: "USD",
        rolloverBalance: 0,
      },
    ],
    meta: { start: "2025-01-01", months: 6 },
  });
});

test("budget horizon route maps auth errors to 401", async () => {
  const jiti = createTestJiti(__filename);
  const { createBudgetHorizonHandler } = await jiti.import(
    "../src/app/api/budget-horizon/horizon/budget-horizon-handler",
  );

  const { POST } = createBudgetHorizonHandler({
    applyHorizon: async () => {
      throw new Error("Missing authenticated session");
    },
  });

  const request = new Request(
    "http://localhost/api/budget-horizon/horizon?spreadsheetId=sheet-xyz",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "shrink", meta: { start: "2025-01-01", months: 6 } }),
    },
  );

  const response = await POST(request);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.error, "Missing authenticated session");
});
