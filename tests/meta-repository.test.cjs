/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

function createSheetsStub({ values = [], throwOnGet = false } = {}) {
  const valueGetCalls = [];
  const valueUpdateCalls = [];
  let storedValues = values;

  const stub = {
    spreadsheets: {
      values: {
        get: async (request) => {
          valueGetCalls.push(request);

          if (throwOnGet) {
            const error = new Error("Unable to parse range: _meta!A1:B100");
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
          valueUpdateCalls.push(request);
          storedValues = request.resource?.values ?? [];
          return { status: 200 };
        },
      },
    },
  };

  return {
    stub,
    valueGetCalls,
    valueUpdateCalls,
    getStoredValues: () => storedValues,
  };
}

test("meta repository load returns key-value map", async () => {
  const jiti = createJiti(__filename);
  const { createMetaRepository } = await jiti.import(
    "../src/server/google/repository/meta-repository",
  );

  const { stub } = createSheetsStub({
    values: [
      ["key", "value"],
      ["schema_version", "1.2.3"],
      ["custom", "abc"],
    ],
  });

  const repo = createMetaRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const entries = await repo.load();

  assert.equal(entries.get("schema_version"), "1.2.3");
  assert.equal(entries.get("custom"), "abc");
  assert.equal(entries.has("key"), false);
});

test("meta repository load handles missing sheet gracefully", async () => {
  const jiti = createJiti(__filename);
  const { createMetaRepository } = await jiti.import(
    "../src/server/google/repository/meta-repository",
  );

  const { stub } = createSheetsStub({
    throwOnGet: true,
  });

  const repo = createMetaRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const entries = await repo.load();

  assert.equal(entries.size, 0);
});

test("meta repository save writes header and entries in order", async () => {
  const jiti = createJiti(__filename);
  const { createMetaRepository } = await jiti.import(
    "../src/server/google/repository/meta-repository",
  );

  const { stub, valueUpdateCalls, getStoredValues } = createSheetsStub();

  const repo = createMetaRepository({
    sheets: stub,
    spreadsheetId: "sheet-123",
  });

  const entries = new Map([
    ["selected_spreadsheet_id", "sheet-123"],
    ["schema_version", "3.0.0"],
    ["last_bootstrapped_at", "2025-01-02T00:00:00.000Z"],
  ]);

  await repo.save(entries);

  assert.equal(valueUpdateCalls.length, 1);

  const update = valueUpdateCalls[0];

  assert.equal(update.spreadsheetId, "sheet-123");
  assert.equal(update.range, "_meta!A1:B4");
  assert.equal(update.valueInputOption, "RAW");

  const rows = update.resource.values;

  assert.deepEqual(rows, [
    ["key", "value"],
    ["selected_spreadsheet_id", "sheet-123"],
    ["schema_version", "3.0.0"],
    ["last_bootstrapped_at", "2025-01-02T00:00:00.000Z"],
  ]);

  assert.deepEqual(getStoredValues(), rows);
});
