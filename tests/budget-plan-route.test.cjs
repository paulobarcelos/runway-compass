/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

function withEnv(run) {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  return (async () => {
    try {
      await run();
    } finally {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
  })();
}

test("budget plan route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/route",
    );

    const handler = createBudgetPlanHandler({
      fetchBudgetPlan: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/budget-plan");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("budget plan route maps auth errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/route",
    );

    const handler = createBudgetPlanHandler({
      fetchBudgetPlan: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request("http://localhost/api/budget-plan?spreadsheetId=sheet-123");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("budget plan route returns data on success", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/route",
    );

    const handler = createBudgetPlanHandler({
      fetchBudgetPlan: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return [
          {
            recordId: "rec-1",
            categoryId: "cat-1",
            month: 1,
            year: 2025,
            amount: 1200.5,
            rolloverBalance: 100,
          },
        ];
      },
    });

    const request = new Request("http://localhost/api/budget-plan?spreadsheetId=sheet-123");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      budgetPlan: [
        {
          recordId: "rec-1",
          categoryId: "cat-1",
          month: 1,
          year: 2025,
          amount: 1200.5,
          rolloverBalance: 100,
        },
      ],
    });
  });
});
