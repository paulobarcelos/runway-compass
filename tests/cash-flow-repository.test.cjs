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
            const error = new Error(
              "Unable to parse range: cash_flows!A1:J2000",
            );
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

test("cash flow repository list returns typed entries", async () => {
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
        "2025-01-05",
        "1500",
        "",
        "",
        "planned",
        "acct-1",
        "Consulting retainer",
      ],
      [
        "flow-2",
        "expense",
        "cat-2",
        "2025-01-08",
        "300",
        "2025-01-10",
        "320",
        "posted",
        "",
        "Supplies",
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

  const entries = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "cash_flows!A1:J4000");

  assert.deepEqual(entries, [
    {
      flowId: "flow-1",
      type: "income",
      categoryId: "cat-1",
      plannedDate: "2025-01-05",
      plannedAmount: 1500,
      actualDate: null,
      actualAmount: null,
      status: "planned",
      accountId: "acct-1",
      note: "Consulting retainer",
    },
    {
      flowId: "flow-2",
      type: "expense",
      categoryId: "cat-2",
      plannedDate: "2025-01-08",
      plannedAmount: 300,
      actualDate: "2025-01-10",
      actualAmount: 320,
      status: "posted",
      accountId: null,
      note: "Supplies",
    },
  ]);
});

test("cash flow repository list throws on missing flow id", async () => {
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
        "2025-01-05",
        "1500",
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

  await assert.rejects(() => repository.list(), {
    message: "Invalid cash flow row at index 2: missing flow_id",
  });
});

test("cash flow repository listByStatus filters entries", async () => {
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
        "flow-1",
        "income",
        "cat-1",
        "2025-01-05",
        "1500",
        "",
        "",
        "planned",
        "",
        "",
      ],
      [
        "flow-2",
        "expense",
        "cat-2",
        "2025-01-08",
        "300",
        "2025-01-10",
        "320",
        "posted",
        "",
        "",
      ],
      [
        "flow-3",
        "expense",
        "cat-3",
        "2025-01-11",
        "120",
        "",
        "",
        "void",
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

  const planned = await repository.listByStatus(["planned"]);
  const posted = await repository.listByStatus(["posted"]);
  const active = await repository.listByStatus(["planned", "posted"]);

  assert.deepEqual(planned.map((item) => item.flowId), ["flow-1"]);
  assert.deepEqual(posted.map((item) => item.flowId), ["flow-2"]);
  assert.deepEqual(active.map((item) => item.flowId), ["flow-1", "flow-2"]);
});

test("summarizeCashFlowsByMonth aggregates planned and posted totals", async () => {
  const jiti = createTestJiti(__filename);
  const { summarizeCashFlowsByMonth } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const totals = summarizeCashFlowsByMonth([
    {
      flowId: "flow-1",
      type: "income",
      categoryId: "cat-1",
      plannedDate: "2025-01-05",
      plannedAmount: 1500,
      actualDate: null,
      actualAmount: null,
      status: "planned",
      accountId: null,
      note: "",
    },
    {
      flowId: "flow-2",
      type: "expense",
      categoryId: "cat-2",
      plannedDate: "2025-01-08",
      plannedAmount: 300,
      actualDate: null,
      actualAmount: null,
      status: "planned",
      accountId: null,
      note: "",
    },
    {
      flowId: "flow-3",
      type: "income",
      categoryId: "cat-3",
      plannedDate: "2025-01-20",
      plannedAmount: 2000,
      actualDate: "2025-02-01",
      actualAmount: 2100,
      status: "posted",
      accountId: null,
      note: "",
    },
    {
      flowId: "flow-4",
      type: "expense",
      categoryId: "cat-4",
      plannedDate: "2025-01-25",
      plannedAmount: 400,
      actualDate: "2025-01-28",
      actualAmount: 380,
      status: "posted",
      accountId: null,
      note: "",
    },
    {
      flowId: "flow-5",
      type: "income",
      categoryId: "cat-5",
      plannedDate: "2025-03-01",
      plannedAmount: 500,
      actualDate: null,
      actualAmount: null,
      status: "void",
      accountId: null,
      note: "",
    },
  ]);

  const entries = Array.from(totals.entries());

  assert.deepEqual(entries, [
    [
      "2025-01",
      {
        month: "2025-01",
        plannedIncome: 1500,
        plannedExpense: 300,
        postedIncome: 0,
        postedExpense: 380,
      },
    ],
    [
      "2025-02",
      {
        month: "2025-02",
        plannedIncome: 0,
        plannedExpense: 0,
        postedIncome: 2100,
        postedExpense: 0,
      },
    ],
  ]);
});

test("cash flow repository save writes headers and rows", async () => {
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
      plannedDate: "2025-01-05",
      plannedAmount: 1500,
      actualDate: null,
      actualAmount: null,
      status: "planned",
      accountId: "acct-1",
      note: "Consulting retainer",
    },
    {
      flowId: "flow-2",
      type: "expense",
      categoryId: "cat-2",
      plannedDate: "2025-01-08",
      plannedAmount: 300,
      actualDate: "2025-01-10",
      actualAmount: 320,
      status: "posted",
      accountId: null,
      note: "Supplies",
    },
  ]);

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].spreadsheetId, "sheet-123");
  assert.equal(updateCalls[0].range, "cash_flows!A1:J3");
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
      "2025-01-05",
      "1500",
      "",
      "",
      "planned",
      "acct-1",
      "Consulting retainer",
    ],
    [
      "flow-2",
      "expense",
      "cat-2",
      "2025-01-08",
      "300",
      "2025-01-10",
      "320",
      "posted",
      "",
      "Supplies",
    ],
  ]);
});
