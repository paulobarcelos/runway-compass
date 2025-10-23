/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function createSheetsStub({ values = [], throwsOnGet = false } = {}) {
  const getCalls = [];
  const updateCalls = [];
  let storedValues = values;

  const stub = {
    spreadsheets: {
      values: {
        get: async (request) => {
          getCalls.push(request);

          if (throwsOnGet) {
            const error = new Error("Unable to parse range: cash_flows!A1:J2000");
            error.code = 400;
            throw error;
          }

          return {
            data: {
              values: storedValues,
            },
          };
        },
        update: async (request) => {
          updateCalls.push(request);
          storedValues = request.requestBody?.values ?? [];
          return { status: 200 };
        },
      },
    },
  };

  return {
    stub,
    getCalls,
    updateCalls,
    getStoredValues: () => storedValues,
  };
}

test("cash flow repository list returns typed records", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      [
        "flow_id",
        "type",
        "category_id",
        "planned_date",
        "planned_amount",
        "actual_date",
        "actual_amount",
        "status",
        "account_id",
        "note",
      ],
      [
        "flow-1",
        "income",
        "cat-1",
        "2025-02-15",
        "2500",
        "2025-02-20",
        "2550",
        "posted",
        "acct-1",
        "Paycheck",
      ],
      [
        "flow-2",
        "expense",
        "",
        "2025-03-01",
        "-450",
        "",
        "",
        "planned",
        "",
        "",
      ],
    ],
  });

  const { createCashFlowRepository } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const repository = createCashFlowRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const rows = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "cash_flows!A1:J2000");

  assert.deepEqual(rows, [
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
    {
      flowId: "flow-2",
      type: "expense",
      categoryId: "",
      plannedDate: "2025-03-01",
      plannedAmount: -450,
      actualDate: "",
      actualAmount: 0,
      status: "planned",
      accountId: "",
      note: "",
    },
  ]);
});

test("cash flow repository list validates required fields", async () => {
  const jiti = createTestJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      [
        "flow_id",
        "type",
        "category_id",
        "planned_date",
        "planned_amount",
        "actual_date",
        "actual_amount",
        "status",
        "account_id",
        "note",
      ],
      [
        "",
        "income",
        "cat-1",
        "2025-02-15",
        "2500",
        "",
        "",
        "planned",
        "",
        "",
      ],
    ],
  });

  const { createCashFlowRepository } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const repository = createCashFlowRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await assert.rejects(async () => repository.list(), {
    message: "Invalid cash flow row at index 2: missing flow_id",
  });
});

test("cash flow repository save persists rows", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub();

  const { createCashFlowRepository } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const repository = createCashFlowRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await repository.save([
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
  ]);

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].spreadsheetId, "sheet-123");
  assert.equal(updateCalls[0].range, "cash_flows!A1:J2");

  assert.deepEqual(getStoredValues(), [
    [
      "flow_id",
      "type",
      "category_id",
      "planned_date",
      "planned_amount",
      "actual_date",
      "actual_amount",
      "status",
      "account_id",
      "note",
    ],
    [
      "flow-1",
      "income",
      "cat-1",
      "2025-02-15",
      "2500",
      "2025-02-20",
      "2550",
      "posted",
      "acct-1",
      "Paycheck",
    ],
  ]);
});
