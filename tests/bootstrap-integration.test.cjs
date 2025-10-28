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

function createSheetsStub({ existingSheets = [], sheetValues = {} } = {}) {
  const batchUpdateCalls = [];
  const valueUpdateCalls = [];

  const sheets = new Set(existingSheets);

  const stub = {
    spreadsheets: {
      get: async () => ({
        data: {
          sheets: Array.from(sheets).map((title) => ({ properties: { title } })),
        },
      }),
      batchUpdate: async (request) => {
        batchUpdateCalls.push(request);
        for (const change of request.requestBody?.requests ?? []) {
          const title = change.addSheet?.properties?.title;
          if (title) {
            sheets.add(title);
          }
        }
        return { status: 200 };
      },
      values: {
        get: async (request) => {
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
          sheetValues[title] = request.requestBody?.values ?? [];
          return { status: 200 };
        },
      },
    },
  };

  return { stub, sheets, batchUpdateCalls, valueUpdateCalls, sheetValues };
}

test("registerSpreadsheetSelection bootstraps every required sheet on pristine spreadsheet", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { registerSpreadsheetSelection } = await jiti.import(
      "../src/server/google/register-spreadsheet",
    );
    const { bootstrapSpreadsheet } = await jiti.import("../src/server/google/bootstrap");
    const { REQUIRED_SHEETS } = await jiti.import("../src/server/google/sheet-schemas");

    const sheetsStub = createSheetsStub();

    const manifest = await registerSpreadsheetSelection({
      spreadsheetId: "sheet-new",
      getSession: async () => ({
        user: { email: "paulo@example.com" },
        googleTokens: {
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: Date.now() + 1000,
        },
      }),
      createSheetsClient: () => sheetsStub.stub,
      bootstrapSpreadsheet,
      schemaVersion: "1.2.3",
      bootstrapSheetTitles: REQUIRED_SHEETS.map((schema) => schema.title),
      now: () => 123456,
    });

    const expectedTitles = new Set(REQUIRED_SHEETS.map((schema) => schema.title));

    expectedTitles.forEach((title) => {
      assert.ok(sheetsStub.sheets.has(title), `expected sheet ${title} to be created`);
    });

    assert.deepEqual(manifest, {
      spreadsheetId: "sheet-new",
      storedAt: 123456,
    });
    assert.ok(
      sheetsStub.valueUpdateCalls.some((call) => call.range.startsWith("_meta!")),
      "meta sheet headers should be written",
    );
  });
});

test("bootstrapExistingSpreadsheet repairs only requested sheets", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { bootstrapExistingSpreadsheet } = await jiti.import(
      "../src/server/google/bootstrap",
    );

    const sheetsStub = createSheetsStub({
      existingSheets: ["_meta", "accounts", "snapshots"],
    });

    const result = await bootstrapExistingSpreadsheet({
      sheets: sheetsStub.stub,
      spreadsheetId: "sheet-existing",
      getSession: async () => ({
        user: { email: "paulo@example.com" },
        googleTokens: {
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: Date.now() + 1000,
        },
      }),
      createSheetsClient: () => sheetsStub.stub,
      sheetTitles: ["categories", "accounts"],
      now: () => 555,
    });

    assert.deepEqual(result.repairedSheets.sort(), ["_meta", "accounts", "categories"].sort());

    const addedTitles = sheetsStub.batchUpdateCalls.flatMap((call) =>
      call.requestBody?.requests?.map((request) => request.addSheet?.properties?.title).filter(Boolean) ?? [],
    );

    assert.deepEqual(addedTitles.sort(), ["categories"]);
  });
});
