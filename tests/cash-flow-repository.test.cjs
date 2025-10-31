/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function createSheetsStub({ values = [], throwsOnGet = false } = {}) {
  const getCalls = [];
  const updateCalls = [];
  const clearCalls = [];
  let storedValues = values;

  const stub = {
    spreadsheets: {
      values: {
        get: async (request) => {
          getCalls.push(request);

          if (throwsOnGet) {
            const error = new Error(
              "Unable to parse range: cash_flows!A1:G2000",
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
        clear: async (request) => {
          clearCalls.push(request);
          storedValues = [];
          return { status: 200 };
        },
      },
    },
  };

  return {
    stub,
    getCalls,
    updateCalls,
    clearCalls,
    getStoredValues: () => storedValues,
  };
}

test("cash flow repository list parses ledger rows", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      [
        "flow_id",
        "date",
        "amount",
        "status",
        "account_id",
        "category_id",
        "note",
      ],
      [
        "flow-1",
        "2025-01-05",
        "1500",
        "planned",
        "acct-ops",
        "cat-consulting",
        "Retainer",
      ],
      [
        "flow-2",
        "2025-01-08",
        "-200",
        "posted",
        "acct-ops",
        "cat-rent",
        "Rent",
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
  assert.equal(getCalls[0].range, "cash_flows!A1:G4000");
  assert.deepEqual(entries, [
    {
      flowId: "flow-1",
      date: "2025-01-05",
      amount: 1500,
      status: "planned",
      accountId: "acct-ops",
      categoryId: "cat-consulting",
      note: "Retainer",
    },
    {
      flowId: "flow-2",
      date: "2025-01-08",
      amount: -200,
      status: "posted",
      accountId: "acct-ops",
      categoryId: "cat-rent",
      note: "Rent",
    },
  ]);
});

test("cash flow repository list rejects missing account", async () => {
  const jiti = createTestJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      ["flow_id", "date", "amount", "status", "account_id", "category_id", "note"],
      ["flow-1", "2025-02-01", "100", "planned", "", "cat-1", ""],
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
    message: "Invalid cash flow row at index 2: missing account_id",
  });
});

test("cash flow repository create appends entry", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, updateCalls, clearCalls, getStoredValues } = createSheetsStub({
    values: [["flow_id", "date", "amount", "status", "account_id", "category_id", "note"]],
  });

  const { createCashFlowRepository } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const repository = createCashFlowRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const entry = await repository.create({
    date: "2025-03-01",
    amount: -75,
    status: "planned",
    accountId: "acct-ops",
    categoryId: "cat-subscription",
    note: "SaaS",
  });

  assert.equal(clearCalls.length, 1);
  assert.equal(updateCalls.length, 1);
  const written = getStoredValues();
  assert.equal(written.length, 2);
  assert.equal(written[1][1], "2025-03-01");
  assert.equal(written[1][2], "-75");
  assert.ok(entry.flowId);
});

test("cash flow repository update overwrites entry", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, getStoredValues } = createSheetsStub({
    values: [
      ["flow_id", "date", "amount", "status", "account_id", "category_id", "note"],
      ["flow-1", "2025-01-05", "100", "planned", "acct-ops", "cat-1", ""],
    ],
  });

  const { createCashFlowRepository } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const repository = createCashFlowRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const updated = await repository.update("flow-1", {
    amount: -120,
    status: "posted",
    note: "Adjusted",
  });

  assert.ok(updated);
  assert.equal(updated.amount, -120);
  assert.equal(updated.status, "posted");
  assert.equal(updated.note, "Adjusted");

  const stored = getStoredValues();
  assert.equal(stored[1][2], "-120");
  assert.equal(stored[1][3], "posted");
});

test("cash flow repository remove deletes entry", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, getStoredValues } = createSheetsStub({
    values: [
      ["flow_id", "date", "amount", "status", "account_id", "category_id", "note"],
      ["flow-1", "2025-01-05", "100", "planned", "acct-ops", "cat-1", ""],
      ["flow-2", "2025-01-06", "-50", "posted", "acct-ops", "cat-2", ""],
    ],
  });

  const { createCashFlowRepository } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const repository = createCashFlowRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await repository.remove("flow-1");

  const stored = getStoredValues();
  assert.equal(stored.length, 2);
  assert.equal(stored[1][0], "flow-2");
});

test("cash flow repository listByStatus filters by provided statuses", async () => {
  const jiti = createTestJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      ["flow_id", "date", "amount", "status", "account_id", "category_id", "note"],
      ["flow-1", "2025-01-05", "100", "planned", "acct-ops", "cat-1", ""],
      ["flow-2", "2025-01-06", "-50", "posted", "acct-ops", "cat-2", ""],
    ],
  });

  const { createCashFlowRepository } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const repository = createCashFlowRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const posted = await repository.listByStatus(["posted"]);
  assert.equal(posted.length, 1);
  assert.equal(posted[0].flowId, "flow-2");
});

test("summarizeCashFlowsByMonth groups sign-based income and expenses", async () => {
  const jiti = createTestJiti(__filename);
  const { summarizeCashFlowsByMonth } = await jiti.import(
    "../src/server/google/repository/cash-flow-repository",
  );

  const summary = summarizeCashFlowsByMonth([
    {
      flowId: "flow-1",
      date: "2025-01-05",
      amount: 200,
      status: "planned",
      accountId: "acct-ops",
      categoryId: "cat-consulting",
      note: "",
    },
    {
      flowId: "flow-2",
      date: "2025-01-10",
      amount: -50,
      status: "planned",
      accountId: "acct-ops",
      categoryId: "cat-tools",
      note: "",
    },
    {
      flowId: "flow-3",
      date: "2025-01-15",
      amount: -75,
      status: "posted",
      accountId: "acct-ops",
      categoryId: "cat-tools",
      note: "",
    },
  ]);

  const january = summary.get("2025-01");
  assert.ok(january);
  assert.equal(january.plannedIncome, 200);
  assert.equal(january.plannedExpense, 50);
  assert.equal(january.postedExpense, 75);
});
