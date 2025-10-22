// ABOUTME: Tests spreadsheet bootstrap API route behavior.
// ABOUTME: Ensures existing selections re-bootstrap correctly.
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

test("bootstrap route validates request payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBootstrapHandler } = await jiti.import(
      "../src/app/api/spreadsheet/bootstrap/route",
    );

    const handler = createBootstrapHandler({
      bootstrap: async () => {
        throw new Error("should not be called");
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

test("bootstrap route maps auth failures to 401", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBootstrapHandler } = await jiti.import(
      "../src/app/api/spreadsheet/bootstrap/route",
    );

    const handler = createBootstrapHandler({
      bootstrap: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const response = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ spreadsheetId: "sheet-123" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("bootstrap route returns manifest on success", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBootstrapHandler } = await jiti.import(
      "../src/app/api/spreadsheet/bootstrap/route",
    );

    const handler = createBootstrapHandler({
      bootstrap: async () => ({
        spreadsheetId: "sheet-123",
        schemaVersion: "2.0.0",
        bootstrappedAt: "2024-01-01T00:00:00.000Z",
        storedAt: 9999,
      }),
    });

    const response = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ spreadsheetId: "sheet-123" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      manifest: {
        spreadsheetId: "sheet-123",
        storedAt: 9999,
        schemaVersion: "2.0.0",
        bootstrappedAt: "2024-01-01T00:00:00.000Z",
      },
    });
  });
});

test("bootstrap route maps unexpected errors to 500", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createBootstrapHandler } = await jiti.import(
      "../src/app/api/spreadsheet/bootstrap/route",
    );

    const handler = createBootstrapHandler({
      bootstrap: async () => {
        throw new Error("API unreachable");
      },
    });

    const response = await handler(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ spreadsheetId: "sheet-123" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.error, "API unreachable");
  });
});
