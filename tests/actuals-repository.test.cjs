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
            const error = new Error("Unable to parse range: actuals!A1:H3000");
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

test("actuals repository list returns typed transactions", async () => {
  const jiti = createJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      ["txn_id", "account_id", "date", "category_id", "amount", "status", "entry_mode", "note"],
      ["txn-1", "acct-1", "2025-01-05", "cat-1", "-45.67", "posted", "manual", "Groceries"],
      ["txn-2", "acct-2", "2025-01-10", "", "1200", "planned", "cash", ""],
    ],
  });

  const { createActualsRepository } = await jiti.import(
    "../src/server/google/repository/actuals-repository",
  );

  const repository = createActualsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const rows = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "actuals!A1:H3000");

  assert.deepEqual(rows, [
    {
      transactionId: "txn-1",
      accountId: "acct-1",
      date: "2025-01-05",
      categoryId: "cat-1",
      amount: -45.67,
      status: "posted",
      entryMode: "manual",
      note: "Groceries",
    },
    {
      transactionId: "txn-2",
      accountId: "acct-2",
      date: "2025-01-10",
      categoryId: "",
      amount: 1200,
      status: "planned",
      entryMode: "cash",
      note: "",
    },
  ]);
});

test("actuals repository list validates required fields", async () => {
  const jiti = createJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      ["txn_id", "account_id", "date", "category_id", "amount", "status", "entry_mode", "note"],
      ["", "acct-1", "2025-01-05", "cat-1", "-45.67", "posted", "manual", ""],
    ],
  });

  const { createActualsRepository } = await jiti.import(
    "../src/server/google/repository/actuals-repository",
  );

  const repository = createActualsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await assert.rejects(() => repository.list(), /Invalid actual row/);
});

test("actuals repository save writes header and rows", async () => {
  const jiti = createJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub({
    values: [
      ["txn_id", "account_id", "date", "category_id", "amount", "status", "entry_mode", "note"],
    ],
  });

  const { createActualsRepository } = await jiti.import(
    "../src/server/google/repository/actuals-repository",
  );

  const repository = createActualsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const rows = [
    {
      transactionId: "txn-1",
      accountId: "acct-1",
      date: "2025-01-05",
      categoryId: "cat-1",
      amount: -45.67,
      status: "posted",
      entryMode: "manual",
      note: "Groceries",
    },
    {
      transactionId: "txn-2",
      accountId: "acct-2",
      date: "2025-01-10",
      categoryId: "",
      amount: 1200,
      status: "planned",
      entryMode: "cash",
      note: "",
    },
  ];

  await repository.save(rows);

  assert.equal(updateCalls.length, 1);
  const call = updateCalls[0];

  assert.equal(call.spreadsheetId, "sheet-123");
  assert.equal(call.range, "actuals!A1:H3");
  assert.equal(call.valueInputOption, "RAW");

  assert.deepEqual(call.resource.values, [
    ["txn_id", "account_id", "date", "category_id", "amount", "status", "entry_mode", "note"],
    ["txn-1", "acct-1", "2025-01-05", "cat-1", "-45.67", "posted", "manual", "Groceries"],
    ["txn-2", "acct-2", "2025-01-10", "", "1200", "planned", "cash", ""],
  ]);

  assert.deepEqual(getStoredValues(), call.resource.values);
});
