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
            const error = new Error("Unable to parse range: snapshots!A1:E1500");
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

test("snapshots repository list returns typed records", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      ["snapshot_id", "account_id", "date", "balance", "note"],
      ["snap-1", "acct-1", "2025-01-31", "2500.50", "Month end"],
      ["snap-2", "acct-2", "2025-02-15", "1000", ""],
    ],
  });

  const { createSnapshotsRepository } = await jiti.import(
    "../src/server/google/repository/snapshots-repository",
  );

  const repository = createSnapshotsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const rows = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "snapshots!A1:E1500");

  assert.deepEqual(rows, [
    {
      snapshotId: "snap-1",
      accountId: "acct-1",
      date: "2025-01-31",
      balance: 2500.5,
      note: "Month end",
    },
    {
      snapshotId: "snap-2",
      accountId: "acct-2",
      date: "2025-02-15",
      balance: 1000,
      note: "",
    },
  ]);
});

test("snapshots repository list validates required fields", async () => {
  const jiti = createTestJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      ["snapshot_id", "account_id", "date", "balance", "note"],
      ["", "acct-1", "2025-01-31", "2500.50", ""],
    ],
  });

  const { createSnapshotsRepository } = await jiti.import(
    "../src/server/google/repository/snapshots-repository",
  );

  const repository = createSnapshotsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await assert.rejects(() => repository.list(), /Invalid snapshot row/);
});

test("snapshots repository save writes header and rows", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub({
    values: [["snapshot_id", "account_id", "date", "balance", "note"]],
  });

  const { createSnapshotsRepository } = await jiti.import(
    "../src/server/google/repository/snapshots-repository",
  );

  const repository = createSnapshotsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const records = [
    {
      snapshotId: "snap-1",
      accountId: "acct-1",
      date: "2025-01-31",
      balance: 2500.5,
      note: "Month end",
    },
    {
      snapshotId: "snap-2",
      accountId: "acct-2",
      date: "2025-02-15",
      balance: 1000,
      note: "",
    },
  ];

  await repository.save(records);

  assert.equal(updateCalls.length, 1);
  const call = updateCalls[0];

  assert.equal(call.spreadsheetId, "sheet-123");
  assert.equal(call.range, "snapshots!A1:E3");
  assert.equal(call.valueInputOption, "RAW");

  assert.deepEqual(call.resource.values, [
    ["snapshot_id", "account_id", "date", "balance", "note"],
    ["snap-1", "acct-1", "2025-01-31", "2500.5", "Month end"],
    ["snap-2", "acct-2", "2025-02-15", "1000", ""],
  ]);

  assert.deepEqual(getStoredValues(), call.resource.values);
});
