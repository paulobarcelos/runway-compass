// ABOUTME: Validates spreadsheet bootstrap logic for meta sheet.
// ABOUTME: Ensures `_meta` sheet created and required rows populated.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

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

const DATA_SHEETS = [
  "categories",
  "accounts",
  "snapshots",
  "budget_plan",
  "actuals",
  "future_events",
  "runway_projection",
];

function createSheetsStub({ existingSheets = [], sheetValues = {} } = {}) {
  const getCalls = [];
  const batchUpdateCalls = [];
  const valueGetCalls = [];
  const valueUpdateCalls = [];

  const sheets = new Set(existingSheets);

  const stub = {
    spreadsheets: {
      get: async (request) => {
        getCalls.push(request);
        return {
          data: {
            sheets: Array.from(sheets).map((title) => ({
              properties: { title },
            })),
          },
        };
      },
      batchUpdate: async (request) => {
        batchUpdateCalls.push(request);
        for (const change of request.requestBody?.requests ?? []) {
          const addedTitle = change.addSheet?.properties?.title;
          if (addedTitle) {
            sheets.add(addedTitle);
          }
        }
        return { status: 200 };
      },
      values: {
        get: async (request) => {
          valueGetCalls.push(request);

          const range = String(request.range ?? "");
          const [title] = range.split("!");

          if (!sheets.has(title)) {
            const error = new Error("sheet not found");
            error.code = 400;
            throw error;
          }

          return {
            data: {
              values: sheetValues[title] ?? [],
            },
          };
        },
        update: async (request) => {
          valueUpdateCalls.push(request);
          const range = String(request.range ?? "");
          const [title] = range.split("!");
          sheetValues[title] = request.resource?.values ?? [];
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
    sheetValues,
    sheets,
  };
}

test("bootstrapSpreadsheet creates meta sheet and rows when missing", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { stub, batchUpdateCalls, valueUpdateCalls } = createSheetsStub({
      existingSheets: DATA_SHEETS,
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
                  frozenRowCount: 0,
                },
              },
            },
          },
        ],
      },
    });

    const metaUpdate = valueUpdateCalls.find((call) =>
      call.range.startsWith("_meta!"),
    );

    assert.ok(metaUpdate, "meta sheet receives header update");
    assert.deepEqual(metaUpdate, {
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

test("bootstrapSpreadsheet limits work to requested sheet titles", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { stub, batchUpdateCalls, valueUpdateCalls } = createSheetsStub({
      existingSheets: ["_meta", "accounts"],
    });

    const { bootstrapSpreadsheet } = await jiti.import(
      "../src/server/google/bootstrap",
    );

    const result = await bootstrapSpreadsheet({
      sheets: stub,
      spreadsheetId: "sheet-abc",
      sheetTitles: ["categories"],
      now: () => 1720000000000,
    });

    assert.deepEqual(result.repairedSheets.sort(), ["_meta", "categories"]);
    assert.equal(batchUpdateCalls.length, 1);
    const requests = batchUpdateCalls[0].requestBody.requests;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].addSheet.properties.title, "categories");

    const headerTargets = valueUpdateCalls.map((call) =>
      call.range.split("!")[0],
    );

    assert.deepEqual(headerTargets.sort(), ["_meta", "categories"]);
  });
});

test("bootstrapSpreadsheet preserves existing keys and selected id", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const existingValues = [
      ["selected_spreadsheet_id", "sheet-existing"],
      ["custom_key", "custom"],
    ];
    const { stub, batchUpdateCalls, valueUpdateCalls } = createSheetsStub({
      existingSheets: ["_meta", ...DATA_SHEETS],
      sheetValues: {
        _meta: existingValues,
      },
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

    const updateRequest = valueUpdateCalls.find((call) =>
      call.range.startsWith("_meta!"),
    );
    assert.ok(updateRequest, "meta sheet update issued");
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
    const jiti = createTestJiti(__filename);

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
    const jiti = createTestJiti(__filename);

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
    const jiti = createTestJiti(__filename);
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
          repairedSheets: payload.sheetTitles ?? ["_meta"],
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
    assert.equal(args.sheetTitles, undefined);
    assert.equal(args.spreadsheetId, "sheet-123");
    assert.equal(args.schemaVersion, "2.5.0");
    assert.equal(typeof args.now, "function");

    assert.deepEqual(result, {
      spreadsheetId: "sheet-123",
      schemaVersion: "2.5.0",
      bootstrappedAt: "2024-01-01T00:00:00.000Z",
      repairedSheets: ["_meta"],
      storedAt: 8888,
    });
  });
});

test("bootstrapSpreadsheet ensures data sheets exist with headers", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { stub, batchUpdateCalls, valueUpdateCalls } = createSheetsStub({
      existingSheets: [],
    });

    const { bootstrapSpreadsheet } = await jiti.import(
      "../src/server/google/bootstrap",
    );

    await bootstrapSpreadsheet({
      sheets: stub,
      spreadsheetId: "sheet-123",
      schemaVersion: "3.1.4",
      now: () => 1710000000000,
    });

    assert.equal(batchUpdateCalls.length, 1, "missing sheets created in single batch");

    const requests = batchUpdateCalls[0].requestBody.requests;
    const addedTitles = requests
      .filter((req) => req.addSheet)
      .map((req) => req.addSheet.properties.title);

    assert.deepEqual(
      addedTitles,
      ["_meta", ...DATA_SHEETS],
    );

    const expectedHeaders = {
      _meta: ["key", "value"],
      categories: [
        "category_id",
        "label",
        "color",
        "rollover_flag",
        "sort_order",
        "monthly_budget",
        "currency_code",
      ],
      accounts: [
        "account_id",
        "name",
        "type",
        "currency",
        "include_in_runway",
        "sort_order",
        "last_snapshot_at",
      ],
      snapshots: ["snapshot_id", "account_id", "date", "balance", "note"],
      budget_plan: [
        "record_id",
        "category_id",
        "month",
        "year",
        "amount",
        "rollover_balance",
      ],
      actuals: [
        "txn_id",
        "account_id",
        "date",
        "category_id",
        "amount",
        "status",
        "entry_mode",
        "note",
      ],
      future_events: [
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
      runway_projection: [
        "month",
        "year",
        "starting_balance",
        "income_total",
        "expense_total",
        "ending_balance",
        "stoplight_status",
        "notes",
      ],
    };

    for (const [title, headers] of Object.entries(expectedHeaders)) {
      const headerUpdate = valueUpdateCalls.find((call) =>
        call.range.startsWith(`${title}!`),
      );

      assert.ok(headerUpdate, `expected header update for ${title}`);
      assert.deepEqual(headerUpdate.resource.values[0], headers);
    }
  });
});
