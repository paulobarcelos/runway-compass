/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");
const {
  CASH_FLOW_EXPECTED_ENTRIES,
} = require("./fixtures/cash-flow-ledger-fixture.cjs");

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
        return CASH_FLOW_EXPECTED_ENTRIES;
      },
    });

    const request = new Request("http://localhost/api/cash-flows?spreadsheetId=sheet-123");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      flows: CASH_FLOW_EXPECTED_ENTRIES,
    });
  });
});

test("POST /api/cash-flows requires flow payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCashFlowsHandler } = await jiti.import(
      "../src/app/api/cash-flows/cash-flows-handler",
    );

    const { POST } = createCashFlowsHandler({
      createCashFlow: async () => {
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
    assert.equal(payload.error, "Missing flow payload");
  });
});

test("POST /api/cash-flows creates flow and returns payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCashFlowsHandler } = await jiti.import(
      "../src/app/api/cash-flows/cash-flows-handler",
    );

    const { POST } = createCashFlowsHandler({
      createCashFlow: async ({ spreadsheetId, draft }) => {
        assert.equal(spreadsheetId, "sheet-123");
        const { flowId, ...rest } = draft;
        assert.equal(flowId, undefined);
        assert.deepEqual(rest, {
          date: "2025-03-01",
          amount: 2500,
          status: "planned",
          accountId: "acct-1",
          categoryId: "cat-1",
          note: "Consulting",
        });
        return {
          flowId: "flow-generated",
          ...rest,
        };
      },
    });

    const request = new Request("http://localhost/api/cash-flows?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        flow: {
          date: "2025-03-01",
          amount: 2500,
          status: "planned",
          accountId: "acct-1",
          categoryId: "cat-1",
          note: "Consulting",
        },
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.equal(payload.flow.flowId, "flow-generated");
    assert.equal(payload.flow.status, "planned");
    assert.equal(payload.flow.amount, 2500);
  });
});

test("PATCH /api/cash-flows/[id] updates the flow", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCashFlowsHandler } = await jiti.import(
      "../src/app/api/cash-flows/cash-flows-handler",
    );

    const { PATCH } = createCashFlowsHandler({
      updateCashFlow: async ({ spreadsheetId, flowId, updates }) => {
        assert.equal(spreadsheetId, "sheet-abc");
        assert.equal(flowId, "flow-1");
        assert.deepEqual(updates, {
          status: "posted",
          amount: -2600,
          note: "Paid",
        });
        return {
          flowId,
          date: "2025-03-01",
          amount: -2600,
          status: "posted",
          accountId: "acct-1",
          categoryId: "cat-1",
          note: "Paid",
        };
      },
    });

    const request = new Request(
      "http://localhost/api/cash-flows/flow-1?spreadsheetId=sheet-abc",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: {
            status: "posted",
            amount: -2600,
            note: "Paid",
          },
        }),
      },
    );

    const response = await PATCH(request, { params: { flowId: "flow-1" } });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.flow.status, "posted");
    assert.equal(payload.flow.amount, -2600);
    assert.equal(payload.flow.note, "Paid");
  });
});

test("DELETE /api/cash-flows/[id] removes the flow", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCashFlowsHandler } = await jiti.import(
      "../src/app/api/cash-flows/cash-flows-handler",
    );

    let removedId = null;

    const { DELETE } = createCashFlowsHandler({
      removeCashFlow: async ({ spreadsheetId, flowId }) => {
        assert.equal(spreadsheetId, "sheet-xyz");
        removedId = flowId;
      },
    });

    const request = new Request(
      "http://localhost/api/cash-flows/flow-void?spreadsheetId=sheet-xyz",
      {
        method: "DELETE",
      },
    );

    const response = await DELETE(request, { params: { flowId: "flow-void" } });

    assert.equal(response.status, 204);
    assert.equal(removedId, "flow-void");
  });
});
