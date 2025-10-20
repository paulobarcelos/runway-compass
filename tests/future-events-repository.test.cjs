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
            const error = new Error("Unable to parse range: future_events!A1:J2000");
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

test("future events repository list returns typed records", async () => {
  const jiti = createJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      [
        "event_id",
        "type",
        "account_id",
        "category_id",
        "start_month",
        "end_month",
        "frequency",
        "amount",
        "status",
        "linked_txn_id",
      ],
      [
        "evt-1",
        "income",
        "acct-1",
        "cat-1",
        "2025-02",
        "2025-05",
        "monthly",
        "2500",
        "scheduled",
        "txn-1",
      ],
      [
        "evt-2",
        "expense",
        "acct-2",
        "",
        "2025-03",
        "",
        "once",
        "-450",
        "planned",
        "",
      ],
    ],
  });

  const { createFutureEventsRepository } = await jiti.import(
    "../src/server/google/repository/future-events-repository",
  );

  const repository = createFutureEventsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const rows = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "future_events!A1:J2000");

  assert.deepEqual(rows, [
    {
      eventId: "evt-1",
      type: "income",
      accountId: "acct-1",
      categoryId: "cat-1",
      startMonth: "2025-02",
      endMonth: "2025-05",
      frequency: "monthly",
      amount: 2500,
      status: "scheduled",
      linkedTransactionId: "txn-1",
    },
    {
      eventId: "evt-2",
      type: "expense",
      accountId: "acct-2",
      categoryId: "",
      startMonth: "2025-03",
      endMonth: "",
      frequency: "once",
      amount: -450,
      status: "planned",
      linkedTransactionId: "",
    },
  ]);
});

test("future events repository list validates required fields", async () => {
  const jiti = createJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      [
        "event_id",
        "type",
        "account_id",
        "category_id",
        "start_month",
        "end_month",
        "frequency",
        "amount",
        "status",
        "linked_txn_id",
      ],
      ["", "income", "acct-1", "cat-1", "2025-02", "", "monthly", "2500", "scheduled", ""],
    ],
  });

  const { createFutureEventsRepository } = await jiti.import(
    "../src/server/google/repository/future-events-repository",
  );

  const repository = createFutureEventsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await assert.rejects(() => repository.list(), /Invalid future event row/);
});

test("future events repository save writes header and rows", async () => {
  const jiti = createJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub({
    values: [
      [
        "event_id",
        "type",
        "account_id",
        "category_id",
        "start_month",
        "end_month",
        "frequency",
        "amount",
        "status",
        "linked_txn_id",
      ],
    ],
  });

  const { createFutureEventsRepository } = await jiti.import(
    "../src/server/google/repository/future-events-repository",
  );

  const repository = createFutureEventsRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const rows = [
    {
      eventId: "evt-1",
      type: "income",
      accountId: "acct-1",
      categoryId: "cat-1",
      startMonth: "2025-02",
      endMonth: "2025-05",
      frequency: "monthly",
      amount: 2500,
      status: "scheduled",
      linkedTransactionId: "txn-1",
    },
    {
      eventId: "evt-2",
      type: "expense",
      accountId: "acct-2",
      categoryId: "",
      startMonth: "2025-03",
      endMonth: "",
      frequency: "once",
      amount: -450,
      status: "planned",
      linkedTransactionId: "",
    },
  ];

  await repository.save(rows);

  assert.equal(updateCalls.length, 1);
  const call = updateCalls[0];

  assert.equal(call.spreadsheetId, "sheet-123");
  assert.equal(call.range, "future_events!A1:J3");
  assert.equal(call.valueInputOption, "RAW");

  assert.deepEqual(call.resource.values, [
    [
      "event_id",
      "type",
      "account_id",
      "category_id",
      "start_month",
      "end_month",
      "frequency",
      "amount",
      "status",
      "linked_txn_id",
    ],
    [
      "evt-1",
      "income",
      "acct-1",
      "cat-1",
      "2025-02",
      "2025-05",
      "monthly",
      "2500",
      "scheduled",
      "txn-1",
    ],
    ["evt-2", "expense", "acct-2", "", "2025-03", "", "once", "-450", "planned", ""],
  ]);

  assert.deepEqual(getStoredValues(), call.resource.values);
});
