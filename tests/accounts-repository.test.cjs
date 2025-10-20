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
        "snapshot_frequency",
        "last_snapshot_at",
      ],
      ["acct-123", "Checking", "checking", "USD", "TRUE", "monthly", "2025-01-01T00:00:00.000Z"],
      ["acct-456", "Savings", "savings", "USD", "FALSE", "quarterly", ""],
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
      snapshotFrequency: "monthly",
      lastSnapshotAt: "2025-01-01T00:00:00.000Z",
    },
    {
      accountId: "acct-456",
      name: "Savings",
      type: "savings",
      currency: "USD",
      includeInRunway: false,
      snapshotFrequency: "quarterly",
      lastSnapshotAt: null,
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
        "snapshot_frequency",
        "last_snapshot_at",
      ],
      ["", "Account", "checking", "USD", "TRUE", "monthly", ""],
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
        "snapshot_frequency",
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
      snapshotFrequency: "monthly",
      lastSnapshotAt: "2025-01-01T00:00:00.000Z",
    },
    {
      accountId: "acct-456",
      name: "Savings",
      type: "savings",
      currency: "USD",
      includeInRunway: false,
      snapshotFrequency: "quarterly",
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
      "snapshot_frequency",
      "last_snapshot_at",
    ],
    ["acct-123", "Checking", "checking", "USD", "TRUE", "monthly", "2025-01-01T00:00:00.000Z"],
    ["acct-456", "Savings", "savings", "USD", "FALSE", "quarterly", ""],
  ]);

  assert.deepEqual(getStoredValues(), call.resource.values);
});
