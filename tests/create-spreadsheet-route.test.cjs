// ABOUTME: Tests spreadsheet creation API route behavior.
// ABOUTME: Ensures manifest registration and errors are handled.
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

test("create route maps auth failures to 401", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createCreateHandler } = await jiti.import(
      "../src/app/api/spreadsheet/create/route",
    );

    const handler = createCreateHandler({
      createAndRegister: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const response = await handler();
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("create route returns manifest on success", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createCreateHandler } = await jiti.import(
      "../src/app/api/spreadsheet/create/route",
    );

    const handler = createCreateHandler({
      createAndRegister: async () => ({
        spreadsheetId: "sheet-created",
        storedAt: 987,
      }),
    });

    const response = await handler();
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      manifest: { spreadsheetId: "sheet-created", storedAt: 987 },
    });
  });
});

test("create route maps unexpected errors to 500", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createCreateHandler } = await jiti.import(
      "../src/app/api/spreadsheet/create/route",
    );

    const handler = createCreateHandler({
      createAndRegister: async () => {
        throw new Error("Drive unavailable");
      },
    });

    const response = await handler();
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.error, "Drive unavailable");
  });
});
