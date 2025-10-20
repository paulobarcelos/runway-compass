// ABOUTME: Validates spreadsheet bootstrap logic for meta sheet.
// ABOUTME: Ensures `_meta` sheet created and required rows populated.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

function withEnv(run) {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  return (async () => {
    try {
      await run();
    } finally {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
  })();
}

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
  await withEnv(async () => {
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
});

test("bootstrapSpreadsheet preserves existing keys and selected id", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const existingValues = [
      ["selected_spreadsheet_id", "sheet-existing"],
      ["custom_key", "custom"],
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
});

test("bootstrapExistingSpreadsheet requires authenticated session", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);

    const { bootstrapExistingSpreadsheet } = await jiti.import(
      "../src/server/google/bootstrap",
    );

    await assert.rejects(
      () =>
        bootstrapExistingSpreadsheet({
          spreadsheetId: "sheet-123",
          getSession: async () => null,
        }),
      /Missing authenticated session/,
    );
  });
});

test("bootstrapExistingSpreadsheet requires Google tokens", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);

    const { bootstrapExistingSpreadsheet } = await jiti.import(
      "../src/server/google/bootstrap",
    );

    await assert.rejects(
      () =>
        bootstrapExistingSpreadsheet({
          spreadsheetId: "sheet-123",
          getSession: async () => ({ user: { email: "paulo@example.com" } }),
        }),
      /Missing Google tokens/,
    );
  });
});

test("bootstrapExistingSpreadsheet bootstraps via Sheets client", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const bootstrapCalls = [];
    let receivedTokens;

    const { bootstrapExistingSpreadsheet } = await jiti.import(
      "../src/server/google/bootstrap",
    );

    const result = await bootstrapExistingSpreadsheet({
      spreadsheetId: "sheet-123",
      getSession: async () => ({
        user: { email: "paulo@example.com" },
        googleTokens: {
          accessToken: "access-123",
          refreshToken: "refresh-456",
          expiresAt: 1730000000,
        },
      }),
      createSheetsClient: (tokens) => {
        receivedTokens = tokens;
        return { type: "sheets" };
      },
      bootstrapSpreadsheet: async (payload) => {
        bootstrapCalls.push(payload);
        return {
          selectedSpreadsheetId: payload.spreadsheetId,
          schemaVersion: payload.schemaVersion ?? "1.0.0",
          bootstrappedAt: "2024-01-01T00:00:00.000Z",
        };
      },
      schemaVersion: "2.5.0",
      now: () => 8888,
    });

    assert.deepEqual(receivedTokens, {
      accessToken: "access-123",
      refreshToken: "refresh-456",
      expiresAt: 1730000000,
    });
    assert.equal(bootstrapCalls.length, 1);
    const args = bootstrapCalls[0];
    assert.deepEqual(args.sheets, { type: "sheets" });
    assert.equal(args.spreadsheetId, "sheet-123");
    assert.equal(args.schemaVersion, "2.5.0");
    assert.equal(typeof args.now, "function");

    assert.deepEqual(result, {
      spreadsheetId: "sheet-123",
      schemaVersion: "2.5.0",
      bootstrappedAt: "2024-01-01T00:00:00.000Z",
      storedAt: 8888,
    });
  });
});
