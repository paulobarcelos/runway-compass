// ABOUTME: Tests spreadsheet registration API route behavior.
// ABOUTME: Verifies responses for validation, auth, and success flows.
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

test("register route validates request payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRegisterHandler } = await jiti.import(
      "../src/app/api/spreadsheet/register/route",
    );

    const handler = createRegisterHandler({
      register: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });

    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("register route maps auth errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRegisterHandler } = await jiti.import(
      "../src/app/api/spreadsheet/register/route",
    );

    const handler = createRegisterHandler({
      register: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ spreadsheetId: "sheet-123" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("register route returns manifest on success", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRegisterHandler } = await jiti.import(
      "../src/app/api/spreadsheet/register/route",
    );

    const handler = createRegisterHandler({
      register: async () => ({
        spreadsheetId: "sheet-123",
        storedAt: 4567,
      }),
    });

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ spreadsheetId: "sheet-123" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      manifest: { spreadsheetId: "sheet-123", storedAt: 4567 },
    });
  });
});
