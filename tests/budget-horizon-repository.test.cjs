/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function createSheetsStub({ metaRows = [], horizonRows = [] } = {}) {
  const valueGetCalls = [];
  const valueUpdateCalls = [];

  const state = {
    meta: metaRows,
    horizon: horizonRows,
  };

  const stub = {
    spreadsheets: {
      values: {
        get: async ({ range }) => {
          valueGetCalls.push(range);

          if (range === "_meta!A1:B100") {
            return {
              data: {
                values: state.meta,
              },
            };
          }

          if (range === "budget_horizon") {
            return {
              data: {
                values: state.horizon,
              },
            };
          }

          throw new Error(`Unexpected range requested: ${range}`);
        },
        update: async ({ range, requestBody }) => {
          valueUpdateCalls.push({ range, requestBody });

          if (range.startsWith("_meta!")) {
            state.meta = requestBody?.values ?? [];
          } else if (range.startsWith("budget_horizon!")) {
            state.horizon = requestBody?.values ?? [];
          }

          return { status: 200 };
        },
      },
    },
  };

  return {
    stub,
    valueGetCalls,
    valueUpdateCalls,
    state,
  };
}

test("budget horizon repository load returns metadata and records", async () => {
  const jiti = createTestJiti(__filename);
  const { createBudgetHorizonRepository } = await jiti.import(
    "../src/server/google/repository/budget-horizon-repository",
  );

  const { stub } = createSheetsStub({
    metaRows: [
      ["key", "value"],
      ["budget_horizon_start", "2025-01-01"],
      ["budget_horizon_months", "3"],
    ],
    horizonRows: [
      [
        "category_id",
        "2025-01_amount",
        "2025-01_currency",
        "2025-02_amount",
        "2025-02_currency",
        "2025-03_amount",
        "2025-03_currency",
      ],
      ["cat-1", "100", "USD", "150", "USD", "200", "USD"],
    ],
  });

  const repository = createBudgetHorizonRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
    now: () => new Date("2025-01-15").getTime(),
  });

  const result = await repository.load();

  assert.deepEqual(result.metadata, {
    start: "2025-01-01",
    months: 3,
  });

  assert.equal(result.records.length, 3);
  assert.deepEqual(result.records[0], {
    recordId: "budget_cat-1_2025-01",
    categoryId: "cat-1",
    month: 1,
    year: 2025,
    amount: 100,
    currency: "USD",
    rolloverBalance: 0,
  });
});

test("budget horizon repository save writes meta and sheet rows", async () => {
  const jiti = createTestJiti(__filename);
  const { createBudgetHorizonRepository } = await jiti.import(
    "../src/server/google/repository/budget-horizon-repository",
  );

  const { stub, valueUpdateCalls, state } = createSheetsStub({
    metaRows: [["key", "value"]],
    horizonRows: [],
  });

  const repository = createBudgetHorizonRepository({
    sheets: stub,
    spreadsheetId: "sheet-save",
    now: () => new Date("2025-06-01").getTime(),
  });

  await repository.save(
    [
      {
        recordId: "budget_cat-1_2025-06",
        categoryId: "cat-1",
        month: 6,
        year: 2025,
        amount: 250,
        currency: "EUR",
        rolloverBalance: 0,
      },
      {
        recordId: "budget_cat-1_2025-07",
        categoryId: "cat-1",
        month: 7,
        year: 2025,
        amount: 275.5,
        currency: "EUR",
        rolloverBalance: 0,
      },
      {
        recordId: "budget_cat-2_2025-06",
        categoryId: "cat-2",
        month: 6,
        year: 2025,
        amount: -100,
        currency: "USD",
        rolloverBalance: 0,
      },
      {
        recordId: "budget_cat-2_2025-07",
        categoryId: "cat-2",
        month: 7,
        year: 2025,
        amount: -80,
        currency: "USD",
        rolloverBalance: 0,
      },
    ],
    {
      start: "2025-06-01",
      months: 2,
    },
  );

  const metaUpdate = valueUpdateCalls.find((call) => call.range.startsWith("_meta!"));
  const sheetUpdate = valueUpdateCalls.find((call) => call.range.startsWith("budget_horizon!"));

  assert.ok(metaUpdate, "meta entries updated");
  assert.ok(sheetUpdate, "sheet values updated");

  assert.deepEqual(state.meta, [
    ["key", "value"],
    ["budget_horizon_start", "2025-06-01"],
    ["budget_horizon_months", "2"],
  ]);

  assert.deepEqual(state.horizon, [
    [
      "category_id",
      "2025-06_amount",
      "2025-06_currency",
      "2025-07_amount",
      "2025-07_currency",
    ],
    ["cat-1", "250", "EUR", "275.5", "EUR"],
    ["cat-2", "-100", "USD", "-80", "USD"],
  ]);
});

test("budget horizon expand copies last known values for new months", async () => {
  const jiti = createTestJiti(__filename);
  const { createBudgetHorizonRepository } = await jiti.import(
    "../src/server/google/repository/budget-horizon-repository",
  );

  const { stub, state } = createSheetsStub({
    metaRows: [
      ["key", "value"],
      ["budget_horizon_start", "2025-01-01"],
      ["budget_horizon_months", "2"],
    ],
    horizonRows: [
      [
        "category_id",
        "2025-01_amount",
        "2025-01_currency",
        "2025-02_amount",
        "2025-02_currency",
      ],
      ["cat-1", "50", "USD", "60", "USD"],
    ],
  });

  const repository = createBudgetHorizonRepository({
    sheets: stub,
    spreadsheetId: "sheet-expand",
    now: () => new Date("2025-02-01").getTime(),
  });

  await repository.expandHorizon({
    start: "2025-01-01",
    months: 4,
  });

  assert.deepEqual(state.meta, [
    ["key", "value"],
    ["budget_horizon_start", "2025-01-01"],
    ["budget_horizon_months", "4"],
  ]);

  assert.deepEqual(state.horizon[0], [
    "category_id",
    "2025-01_amount",
    "2025-01_currency",
    "2025-02_amount",
    "2025-02_currency",
    "2025-03_amount",
    "2025-03_currency",
    "2025-04_amount",
    "2025-04_currency",
  ]);

  assert.deepEqual(state.horizon[1], [
    "cat-1",
    "50",
    "USD",
    "60",
    "USD",
    "60",
    "USD",
    "60",
    "USD",
  ]);
});
