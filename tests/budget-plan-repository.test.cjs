/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

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
            const error = new Error("Unable to parse range: budget_plan!A1:F2000");
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
          storedValues = request.resource?.values ?? [];
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

test("budget plan repository list returns typed records", async () => {
  const jiti = createJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      ["record_id", "category_id", "month", "year", "amount", "rollover_balance"],
      ["rec-1", "cat-1", "1", "2025", "1200.50", "100.00"],
      ["rec-2", "cat-2", "2", "2025", "300.00", ""],
    ],
  });

  const { createBudgetPlanRepository } = await jiti.import(
    "../src/server/google/repository/budget-plan-repository",
  );

  const repository = createBudgetPlanRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const rows = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "budget_plan!A1:F2000");

  assert.deepEqual(rows, [
    {
      recordId: "rec-1",
      categoryId: "cat-1",
      month: 1,
      year: 2025,
      amount: 1200.5,
      rolloverBalance: 100,
    },
    {
      recordId: "rec-2",
      categoryId: "cat-2",
      month: 2,
      year: 2025,
      amount: 300,
      rolloverBalance: 0,
    },
  ]);
});

test("budget plan repository list validates required fields", async () => {
  const jiti = createJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      ["record_id", "category_id", "month", "year", "amount", "rollover_balance"],
      ["", "cat-1", "1", "2025", "120", ""],
    ],
  });

  const { createBudgetPlanRepository } = await jiti.import(
    "../src/server/google/repository/budget-plan-repository",
  );

  const repository = createBudgetPlanRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await assert.rejects(() => repository.list(), /Invalid budget plan row/);
});

test("budget plan repository save writes header and rows", async () => {
  const jiti = createJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub({
    values: [
      ["record_id", "category_id", "month", "year", "amount", "rollover_balance"],
    ],
  });

  const { createBudgetPlanRepository } = await jiti.import(
    "../src/server/google/repository/budget-plan-repository",
  );

  const repository = createBudgetPlanRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const records = [
    {
      recordId: "rec-1",
      categoryId: "cat-1",
      month: 1,
      year: 2025,
      amount: 1200.5,
      rolloverBalance: 100,
    },
    {
      recordId: "rec-2",
      categoryId: "cat-2",
      month: 2,
      year: 2025,
      amount: 300,
      rolloverBalance: 0,
    },
  ];

  await repository.save(records);

  assert.equal(updateCalls.length, 1);
  const call = updateCalls[0];

  assert.equal(call.spreadsheetId, "sheet-123");
  assert.equal(call.range, "budget_plan!A1:F3");
  assert.equal(call.valueInputOption, "RAW");

  assert.deepEqual(call.resource.values, [
    ["record_id", "category_id", "month", "year", "amount", "rollover_balance"],
    ["rec-1", "cat-1", "1", "2025", "1200.5", "100"],
    ["rec-2", "cat-2", "2", "2025", "300", "0"],
  ]);

  assert.deepEqual(getStoredValues(), call.resource.values);
});
