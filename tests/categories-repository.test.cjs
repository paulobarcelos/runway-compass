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
      [
        "category_id",
        "label",
        "color",
        "description",
        "sort_order",
      ],
      ["cat-123", "Housing", "#FF0000", "Mortgage", "1"],
      ["cat-456", "Food", "#00FF00", "", "2"],
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
  assert.equal(getCalls[0].range, "categories!A1:E1000");

  assert.deepEqual(categories, [
    {
      categoryId: "cat-123",
      label: "Housing",
      color: "#FF0000",
      description: "Mortgage",
      sortOrder: 1,
    },
    {
      categoryId: "cat-456",
      label: "Food",
      color: "#00FF00",
      description: "",
      sortOrder: 2,
    },
  ]);
});

test("categories repository list filters empty or malformed rows", async () => {
  const jiti = createTestJiti(__filename);
  const { stub } = createSheetsStub({
    values: [
      [
        "category_id",
        "label",
        "color",
        "description",
        "sort_order",
      ],
      ["", "Missing ID", "#000000", "Invalid", "3"],
      ["cat-789", "", "#111111", "Groceries", "4"],
      ["cat-999", "Travel", "", "Trips", ""],
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
      [
        "category_id",
        "label",
        "color",
        "description",
        "sort_order",
      ],
      ["cat-111", "Utilities", "#ABCDEF", "Power", "3"],
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
      description: "Power",
      sortOrder: 3,
    },
  ]);
});

test("categories repository save persists header and rows", async () => {
  const jiti = createTestJiti(__filename);
  const { stub, updateCalls, getStoredValues } = createSheetsStub({
    values: [
      [
        "category_id",
        "label",
        "color",
        "description",
        "sort_order",
      ],
    ],
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
      description: "Mortgage",
      sortOrder: 5,
    },
    {
      categoryId: "cat-456",
      label: "Food",
      color: "#00FF00",
      description: "",
      sortOrder: 10,
    },
  ];

  await repository.save(records);

  assert.equal(updateCalls.length, 1);

  const call = updateCalls[0];
  assert.equal(call.spreadsheetId, "sheet-123");
  assert.equal(call.range, "categories!A1:E3");
  assert.equal(call.valueInputOption, "RAW");

  assert.deepEqual(call.requestBody.values, [
    [
      "category_id",
      "label",
      "color",
      "description",
      "sort_order",
    ],
    ["cat-123", "Housing", "#FF0000", "Mortgage", "5"],
    ["cat-456", "Food", "#00FF00", "", "10"],
  ]);

  assert.deepEqual(getStoredValues(), call.requestBody.values);
});
