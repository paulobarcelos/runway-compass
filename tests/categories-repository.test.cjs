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
            const error = new Error("Unable to parse range: categories!A2:E");
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

test("categories repository list returns typed records", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, getCalls } = createSheetsStub({
    values: [
      ["category_id", "label", "color", "rollover_flag", "sort_order", "monthly_budget", "currency_code"],
      ["cat-123", "Housing", "#FF0000", "TRUE", "1", "1200", "SEK"],
      ["cat-456", "Food", "#00FF00", "FALSE", "2", "", ""],
    ],
  });

  const { createCategoriesRepository } = await jiti.import(
    "../src/server/google/repository/categories-repository",
  );

  const repository = createCategoriesRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const categories = await repository.list();

  assert.equal(getCalls.length, 1);
  assert.equal(getCalls[0].spreadsheetId, "sheet-123");
  assert.equal(getCalls[0].range, "categories!A1:G1000");

  assert.deepEqual(categories, [
    {
      categoryId: "cat-123",
      label: "Housing",
      color: "#FF0000",
      rolloverFlag: true,
      sortOrder: 1,
      monthlyBudget: 1200,
      currencyCode: "SEK",
    },
    {
      categoryId: "cat-456",
      label: "Food",
      color: "#00FF00",
      rolloverFlag: false,
      sortOrder: 2,
      monthlyBudget: 0,
      currencyCode: "",
    },
  ]);
});

test("categories repository list filters empty or malformed rows", async () => {
  const jiti = createTestJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      ["category_id", "label", "color", "rollover_flag", "sort_order", "monthly_budget", "currency_code"],
      ["", "Missing ID", "#000000", "TRUE", "3", "300", "USD"],
      ["cat-789", "", "#111111", "TRUE", "4", "200", "USD"],
      ["cat-999", "Travel", "", "TRUE", "", ""],
    ],
  });

  const { createCategoriesRepository } = await jiti.import(
    "../src/server/google/repository/categories-repository",
  );

  const repository = createCategoriesRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  await assert.rejects(() => repository.list(), /Invalid category row/);
});

test("categories repository list retries transient errors", async () => {
  const jiti = createTestJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      ["category_id", "label", "color", "rollover_flag", "sort_order", "monthly_budget", "currency_code"],
      ["cat-111", "Utilities", "#ABCDEF", "TRUE", "3", "500", "USD"],
    ],
  });

  let attempts = 0;
  const originalGet = stub.spreadsheets.values.get;

  stub.spreadsheets.values.get = async (request) => {
    attempts += 1;

    if (attempts === 1) {
      const error = new Error("Service unavailable");
      error.code = 503;
      throw error;
    }

    return originalGet(request);
  };

  const { createCategoriesRepository } = await jiti.import(
    "../src/server/google/repository/categories-repository",
  );

  const repository = createCategoriesRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const categories = await repository.list();

  assert.equal(attempts, 2);

  assert.deepEqual(categories, [
    {
      categoryId: "cat-111",
      label: "Utilities",
      color: "#ABCDEF",
      rolloverFlag: true,
      sortOrder: 3,
      monthlyBudget: 500,
      currencyCode: "USD",
    },
  ]);
});

test("categories repository save persists header and rows", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub({
    values: [["category_id", "label", "color", "rollover_flag", "sort_order", "monthly_budget", "currency_code"]],
  });

  const { createCategoriesRepository } = await jiti.import(
    "../src/server/google/repository/categories-repository",
  );

  const repository = createCategoriesRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const records = [
    {
      categoryId: "cat-123",
      label: "Housing",
      color: "#FF0000",
      rolloverFlag: true,
      sortOrder: 5,
      monthlyBudget: 1500,
      currencyCode: "SEK",
    },
    {
      categoryId: "cat-456",
      label: "Food",
      color: "#00FF00",
      rolloverFlag: false,
      sortOrder: 10,
      monthlyBudget: 0,
      currencyCode: "",
    },
  ];

  await repository.save(records);

  assert.equal(updateCalls.length, 1);

  const call = updateCalls[0];
  assert.equal(call.spreadsheetId, "sheet-123");
  assert.equal(call.range, "categories!A1:G3");
  assert.equal(call.valueInputOption, "RAW");

  assert.deepEqual(call.requestBody.values, [
    ["category_id", "label", "color", "rollover_flag", "sort_order", "monthly_budget", "currency_code"],
    ["cat-123", "Housing", "#FF0000", "TRUE", "5", "1500", "SEK"],
    ["cat-456", "Food", "#00FF00", "FALSE", "10", "", ""],
  ]);

  assert.deepEqual(getStoredValues(), call.requestBody.values);
});
