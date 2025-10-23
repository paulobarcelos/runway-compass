/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

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
    const jiti = createTestJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/budget-plan-handler",
    );

    const { GET } = createBudgetPlanHandler({
      fetchBudgetPlan: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/budget-plan");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("budget plan route maps auth errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/budget-plan-handler",
    );

    const { GET } = createBudgetPlanHandler({
      fetchBudgetPlan: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request("http://localhost/api/budget-plan?spreadsheetId=sheet-123");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("budget plan route returns data on success", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/budget-plan-handler",
    );

    const { GET } = createBudgetPlanHandler({
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
    const response = await GET(request);
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

test("budget plan update route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/budget-plan-handler",
    );

    const { POST } = createBudgetPlanHandler({
      saveBudgetPlan: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/budget-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetPlan: [] }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("budget plan update route validates payload shape", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/budget-plan-handler",
    );

    const { POST } = createBudgetPlanHandler({
      saveBudgetPlan: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/budget-plan?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing budgetPlan payload");
  });
});

test("budget plan update route persists records and returns payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBudgetPlanHandler } = await jiti.import(
      "../src/app/api/budget-plan/budget-plan-handler",
    );

    const saved = [];

    const { POST } = createBudgetPlanHandler({
      saveBudgetPlan: async ({ spreadsheetId, budgetPlan }) => {
        assert.equal(spreadsheetId, "sheet-123");
        saved.push(...budgetPlan);
      },
    });

    const payload = [
      {
        recordId: "rec-1",
        categoryId: "cat-1",
        month: 2,
        year: 2026,
        amount: 400,
        rolloverBalance: 10,
      },
    ];

    const request = new Request("http://localhost/api/budget-plan?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetPlan: payload }),
    });

    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(saved, payload);
    assert.deepEqual(body, { budgetPlan: payload });
  });
});
