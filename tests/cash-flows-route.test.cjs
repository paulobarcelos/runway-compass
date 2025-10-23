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

test("cash flows route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCashFlowsHandler } = await jiti.import(
      "../src/app/api/cash-flows/cash-flows-handler",
    );

    const { GET } = createCashFlowsHandler({
      fetchCashFlows: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/cash-flows");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("cash flows route returns data on success", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCashFlowsHandler } = await jiti.import(
      "../src/app/api/cash-flows/cash-flows-handler",
    );

    const { GET } = createCashFlowsHandler({
      fetchCashFlows: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return [
          {
            flowId: "flow-1",
            type: "income",
            categoryId: "cat-1",
            plannedDate: "2025-02-15",
            plannedAmount: 2500,
            actualDate: "2025-02-20",
            actualAmount: 2550,
            status: "posted",
            accountId: "acct-1",
            note: "Paycheck",
          },
        ];
      },
    });

    const request = new Request("http://localhost/api/cash-flows?spreadsheetId=sheet-123");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      flows: [
        {
          flowId: "flow-1",
          type: "income",
          categoryId: "cat-1",
          plannedDate: "2025-02-15",
          plannedAmount: 2500,
          actualDate: "2025-02-20",
          actualAmount: 2550,
          status: "posted",
          accountId: "acct-1",
          note: "Paycheck",
        },
      ],
    });
  });
});

test("cash flows save route validates payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCashFlowsHandler } = await jiti.import(
      "../src/app/api/cash-flows/cash-flows-handler",
    );

    const { POST } = createCashFlowsHandler({
      saveCashFlows: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/cash-flows?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing flows payload");
  });
});

test("cash flows save route persists flows", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCashFlowsHandler } = await jiti.import(
      "../src/app/api/cash-flows/cash-flows-handler",
    );

    const saved = [];

    const { POST } = createCashFlowsHandler({
      saveCashFlows: async ({ spreadsheetId, flows }) => {
        assert.equal(spreadsheetId, "sheet-123");
        saved.push(...flows);
      },
    });

    const payload = {
      flowId: "flow-1",
      type: "income",
      categoryId: "cat-1",
      plannedDate: "2025-02-15",
      plannedAmount: 2500,
      actualDate: "2025-02-20",
      actualAmount: 2550,
      status: "posted",
      accountId: "acct-1",
      note: "Paycheck",
    };

    const request = new Request("http://localhost/api/cash-flows?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flows: [payload] }),
    });

    const response = await POST(request);

    assert.equal(response.status, 200);
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], payload);
  });
});
