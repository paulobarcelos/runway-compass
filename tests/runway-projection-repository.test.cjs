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
            const error = new Error("Unable to parse range: runway_projection!A1:H1500");
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

test("runway projection repository list returns typed records", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      [
        "month",
        "year",
        "starting_balance",
        "income_total",
        "expense_total",
        "ending_balance",
        "stoplight_status",
        "notes",
      ],
      ["1", "2025", "10000", "5000", "3000", "12000", "green", "comfort"],
      ["2", "2025", "12000", "4000", "6000", "10000", "yellow", ""],
    ],
  });

  const { createRunwayProjectionRepository } = await jiti.import(
    "../src/server/google/repository/runway-projection-repository",
  );

  const repository = createRunwayProjectionRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const rows = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "runway_projection!A1:H1500");

  assert.deepEqual(rows, [
    {
      month: 1,
      year: 2025,
      startingBalance: 10000,
      incomeTotal: 5000,
      expenseTotal: 3000,
      endingBalance: 12000,
      stoplightStatus: "green",
      notes: "comfort",
    },
    {
      month: 2,
      year: 2025,
      startingBalance: 12000,
      incomeTotal: 4000,
      expenseTotal: 6000,
      endingBalance: 10000,
      stoplightStatus: "yellow",
      notes: "",
    },
  ]);
});

test("runway projection repository list validates required fields", async () => {
  const jiti = createTestJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      [
        "month",
        "year",
        "starting_balance",
        "income_total",
        "expense_total",
        "ending_balance",
        "stoplight_status",
        "notes",
      ],
      ["", "2025", "10000", "5000", "3000", "12000", "green", ""],
    ],
  });

  const { createRunwayProjectionRepository } = await jiti.import(
    "../src/server/google/repository/runway-projection-repository",
  );

  const repository = createRunwayProjectionRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await assert.rejects(() => repository.list(), /Invalid runway projection row/);
});

test("runway projection repository save writes header and rows", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub({
    values: [
      [
        "month",
        "year",
        "starting_balance",
        "income_total",
        "expense_total",
        "ending_balance",
        "stoplight_status",
        "notes",
      ],
    ],
  });

  const { createRunwayProjectionRepository } = await jiti.import(
    "../src/server/google/repository/runway-projection-repository",
  );

  const repository = createRunwayProjectionRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const records = [
    {
      month: 1,
      year: 2025,
      startingBalance: 10000,
      incomeTotal: 5000,
      expenseTotal: 3000,
      endingBalance: 12000,
      stoplightStatus: "green",
      notes: "comfort",
    },
    {
      month: 2,
      year: 2025,
      startingBalance: 12000,
      incomeTotal: 4000,
      expenseTotal: 6000,
      endingBalance: 10000,
      stoplightStatus: "yellow",
      notes: "",
    },
  ];

  await repository.save(records);

  assert.equal(updateCalls.length, 1);
  const call = updateCalls[0];

  assert.equal(call.spreadsheetId, "sheet-123");
  assert.equal(call.range, "runway_projection!A1:H3");
  assert.equal(call.valueInputOption, "RAW");

  assert.deepEqual(call.resource.values, [
    [
      "month",
      "year",
      "starting_balance",
      "income_total",
      "expense_total",
      "ending_balance",
      "stoplight_status",
      "notes",
    ],
    ["1", "2025", "10000", "5000", "3000", "12000", "green", "comfort"],
    ["2", "2025", "12000", "4000", "6000", "10000", "yellow", ""],
  ]);

  assert.deepEqual(getStoredValues(), call.resource.values);
});
