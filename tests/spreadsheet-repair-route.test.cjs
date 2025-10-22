// ABOUTME: Tests spreadsheet repair API route handling and payload validation.
// ABOUTME: Ensures repair calls respect optional sheet filtering and auth mapping.
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

test("repair route validates spreadsheet id", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRepairHandler } = await jiti.import(
      "../src/app/api/spreadsheet/repair/route",
    );

    const handler = createRepairHandler({
      repair: async () => {
        throw new Error("should-not-run");
      },
    });

    const response = await handler(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("repair route forwards sheet list to handler", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRepairHandler } = await jiti.import(
      "../src/app/api/spreadsheet/repair/route",
    );

    const calls = [];

    const handler = createRepairHandler({
      repair: async (params) => {
        calls.push(params);
        return {
          spreadsheetId: params.spreadsheetId,
          schemaVersion: "1.0.0",
          bootstrappedAt: "2024-01-02T00:00:00.000Z",
          repairedSheets: params.sheetTitles ?? ["accounts"],
          storedAt: 54321,
        };
      },
    });

    const response = await handler(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: "sheet-xyz",
          sheets: ["categories", "snapshots", "invalid"],
        }),
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(calls[0], {
      spreadsheetId: "sheet-xyz",
      sheetTitles: ["categories", "snapshots"],
    });
    assert.deepEqual(payload, {
      manifest: {
        spreadsheetId: "sheet-xyz",
        schemaVersion: "1.0.0",
        bootstrappedAt: "2024-01-02T00:00:00.000Z",
        storedAt: 54321,
      },
      repairedSheets: ["categories", "snapshots"],
    });
  });
});

test("repair route maps auth failures to 401", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRepairHandler } = await jiti.import(
      "../src/app/api/spreadsheet/repair/route",
    );

    const handler = createRepairHandler({
      repair: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const response = await handler(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: "sheet-xyz" }),
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});
