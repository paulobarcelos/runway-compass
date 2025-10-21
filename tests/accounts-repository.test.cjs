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
            const error = new Error("Unable to parse range: accounts!A1:G1000");
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

test("accounts repository list returns typed records", async () => {
  const jiti = createJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      [
        "account_id",
        "name",
        "type",
        "currency",
        "include_in_runway",
        "sort_order",
        "last_snapshot_at",
      ],
      ["acct-123", "Checking", "checking", "USD", "TRUE", "1", "2025-01-01T00:00:00.000Z"],
      ["acct-456", "Savings", "savings", "USD", "FALSE", "2", ""],
    ],
  });

  const { createAccountsRepository } = await jiti.import(
    "../src/server/google/repository/accounts-repository",
  );

  const repository = createAccountsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const accounts = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "accounts!A1:G1000");

  assert.deepEqual(accounts, [
    {
      accountId: "acct-123",
      name: "Checking",
      type: "checking",
      currency: "USD",
      includeInRunway: true,
      sortOrder: 1,
      lastSnapshotAt: "2025-01-01T00:00:00.000Z",
    },
    {
      accountId: "acct-456",
      name: "Savings",
      type: "savings",
      currency: "USD",
      includeInRunway: false,
      sortOrder: 2,
      lastSnapshotAt: null,
    },
  ]);
});

test("accounts repository listWithDiagnostics coerces invalid sort order and emits warnings", async () => {
  const jiti = createJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      [
        "account_id",
        "name",
        "type",
        "currency",
        "include_in_runway",
        "sort_order",
        "last_snapshot_at",
      ],
      ["acct-123", "Checking", "checking", "USD", "TRUE", "1", ""],
      ["acct-789", "Brokerage", "brokerage", "USD", "TRUE", "not-a-number", ""],
    ],
  });

  const { createAccountsRepository } = await jiti.import(
    "../src/server/google/repository/accounts-repository",
  );

  const repository = createAccountsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const result = await repository.listWithDiagnostics();

  assert.deepEqual(result.accounts, [
    {
      accountId: "acct-123",
      name: "Checking",
      type: "checking",
      currency: "USD",
      includeInRunway: true,
      sortOrder: 1,
      lastSnapshotAt: null,
    },
    {
      accountId: "acct-789",
      name: "Brokerage",
      type: "brokerage",
      currency: "USD",
      includeInRunway: true,
      sortOrder: 0,
      lastSnapshotAt: null,
    },
  ]);

  assert.deepEqual(result.warnings, [
    {
      rowNumber: 3,
      code: "invalid_sort_order",
      message: 'Sort order value "not-a-number" is not a valid integer',
    },
  ]);
});

test("accounts repository list validates required fields", async () => {
  const jiti = createJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      [
        "account_id",
        "name",
        "type",
        "currency",
        "include_in_runway",
        "sort_order",
        "last_snapshot_at",
      ],
      ["", "Account", "checking", "USD", "TRUE", "1", ""],
    ],
  });

  const { createAccountsRepository } = await jiti.import(
    "../src/server/google/repository/accounts-repository",
  );

  const repository = createAccountsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await assert.rejects(() => repository.list(), /Invalid account row/);
});

test("accounts repository save writes header and rows", async () => {
  const jiti = createJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub({
    values: [
      [
        "account_id",
        "name",
        "type",
        "currency",
        "include_in_runway",
        "sort_order",
        "last_snapshot_at",
      ],
    ],
  });

  const { createAccountsRepository } = await jiti.import(
    "../src/server/google/repository/accounts-repository",
  );

  const repository = createAccountsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const records = [
    {
      accountId: "acct-123",
      name: "Checking",
      type: "checking",
      currency: "USD",
      includeInRunway: true,
      sortOrder: 1,
      lastSnapshotAt: "2025-01-01T00:00:00.000Z",
    },
    {
      accountId: "acct-456",
      name: "Savings",
      type: "savings",
      currency: "USD",
      includeInRunway: false,
      sortOrder: 2,
      lastSnapshotAt: null,
    },
  ];

  await repository.save(records);

  assert.equal(updateCalls.length, 1);
  const call = updateCalls[0];

  assert.equal(call.spreadsheetId, "sheet-123");
  assert.equal(call.range, "accounts!A1:G3");
  assert.equal(call.valueInputOption, "RAW");

  assert.deepEqual(call.resource.values, [
    [
      "account_id",
      "name",
      "type",
      "currency",
      "include_in_runway",
        "sort_order",
        "last_snapshot_at",
      ],
    ["acct-123", "Checking", "checking", "USD", "TRUE", "1", "2025-01-01T00:00:00.000Z"],
    ["acct-456", "Savings", "savings", "USD", "FALSE", "2", ""],
  ]);

  assert.deepEqual(getStoredValues(), call.resource.values);
});
