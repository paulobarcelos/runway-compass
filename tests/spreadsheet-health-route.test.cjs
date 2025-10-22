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

test("spreadsheet health route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createSpreadsheetHealthHandler } = await jiti.import(
      "../src/app/api/spreadsheet/health/route",
    );

    const { GET } = createSpreadsheetHealthHandler({
      fetchDiagnostics: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/spreadsheet/health");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("spreadsheet health route maps authentication errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createSpreadsheetHealthHandler } = await jiti.import(
      "../src/app/api/spreadsheet/health/route",
    );

    const { GET } = createSpreadsheetHealthHandler({
      fetchDiagnostics: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request(
      "http://localhost/api/spreadsheet/health?spreadsheetId=sheet-123",
    );
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("spreadsheet health route returns diagnostics payload on success", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createSpreadsheetHealthHandler } = await jiti.import(
      "../src/app/api/spreadsheet/health/route",
    );

    const diagnostics = {
      warnings: [
        {
          sheetId: "accounts",
          sheetTitle: "Accounts",
          sheetGid: 110,
          severity: "warning",
          code: "invalid_sort_order",
          message: "Sort order invalid",
          rowNumber: 5,
        },
      ],
      errors: [
        {
          sheetId: "accounts",
          sheetTitle: "Accounts",
          sheetGid: 110,
          severity: "error",
          code: "missing_sheet",
          message: "Accounts tab missing",
          rowNumber: null,
        },
      ],
    };

    const { GET } = createSpreadsheetHealthHandler({
      fetchDiagnostics: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return diagnostics;
      },
    });

    const request = new Request(
      "http://localhost/api/spreadsheet/health?spreadsheetId=sheet-123",
    );
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { diagnostics });
  });
});
