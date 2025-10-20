// ABOUTME: Validates spreadsheet bootstrap logic for meta sheet.
// ABOUTME: Ensures `_meta` sheet created and required rows populated.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

function createSheetsStub({ hasMeta = false, values = [] } = {}) {
  const getCalls = [];
  const batchUpdateCalls = [];
  const valueGetCalls = [];
  const valueUpdateCalls = [];

  const stub = {
    spreadsheets: {
      get: async (request) => {
        getCalls.push(request);
        return {
          data: {
            sheets: hasMeta
              ? [{ properties: { title: "_meta" } }]
              : [{ properties: { title: "other" } }],
          },
        };
      },
      batchUpdate: async (request) => {
        batchUpdateCalls.push(request);
        hasMeta = true;
        return { status: 200 };
      },
      values: {
        get: async (request) => {
          valueGetCalls.push(request);

          if (!hasMeta) {
            const error = new Error("sheet not found");
            error.code = 400;
            throw error;
          }

          return {
            data: {
              values,
            },
          };
        },
        update: async (request) => {
          valueUpdateCalls.push(request);
          return { status: 200 };
        },
      },
    },
  };

  return {
    stub,
    getCalls,
    batchUpdateCalls,
    valueGetCalls,
    valueUpdateCalls,
  };
}

test("bootstrapSpreadsheet creates meta sheet and rows when missing", async () => {
  const jiti = createJiti(__filename);
  const { stub, batchUpdateCalls, valueUpdateCalls } = createSheetsStub({
    hasMeta: false,
    values: [],
  });

  const { bootstrapSpreadsheet } = await jiti.import(
    "../src/server/google/bootstrap",
  );

  await bootstrapSpreadsheet({
    sheets: stub,
    spreadsheetId: "sheet-123",
    schemaVersion: "2.0.0",
    now: () => 1700000000000,
  });

  assert.equal(batchUpdateCalls.length, 1);
  assert.deepEqual(batchUpdateCalls[0], {
    spreadsheetId: "sheet-123",
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: "_meta",
              sheetType: "GRID",
              hidden: true,
              gridProperties: {
                rowCount: 20,
                columnCount: 2,
              },
            },
          },
        },
      ],
    },
  });

  assert.equal(valueUpdateCalls.length, 1);
  assert.deepEqual(valueUpdateCalls[0], {
    spreadsheetId: "sheet-123",
    range: "_meta!A1:B4",
    valueInputOption: "RAW",
    resource: {
      values: [
        ["key", "value"],
        ["selected_spreadsheet_id", "sheet-123"],
        ["schema_version", "2.0.0"],
        ["last_bootstrapped_at", new Date(1700000000000).toISOString()],
      ],
    },
  });
});

test("bootstrapSpreadsheet preserves existing keys and selected id", async () => {
  const jiti = createJiti(__filename);
  const existingValues = [
    ["selected_spreadsheet_id", "sheet-existing"],
    ["custom_key", "custom"]
  ];
  const { stub, batchUpdateCalls, valueUpdateCalls } = createSheetsStub({
    hasMeta: true,
    values: existingValues,
  });

  const { bootstrapSpreadsheet } = await jiti.import(
    "../src/server/google/bootstrap",
  );

  await bootstrapSpreadsheet({
    sheets: stub,
    spreadsheetId: "sheet-123",
    schemaVersion: "1.2.3",
    now: () => 1710000000000,
  });

  assert.equal(batchUpdateCalls.length, 0, "meta sheet not recreated");
  assert.equal(valueUpdateCalls.length, 1);

  const updateRequest = valueUpdateCalls[0];
  const rows = updateRequest.resource.values;

  assert.deepEqual(rows[0], ["key", "value"]);
  assert.deepEqual(rows[1], ["selected_spreadsheet_id", "sheet-existing"]);
  assert.deepEqual(rows[2], ["schema_version", "1.2.3"]);
  assert.deepEqual(rows[3], ["last_bootstrapped_at", new Date(1710000000000).toISOString()]);
  assert.deepEqual(rows[4], ["custom_key", "custom"]);
});
