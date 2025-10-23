// ABOUTME: Validates spreadsheet creation and registration helper.
// ABOUTME: Ensures Drive creation integrates with manifest storage.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

test("createAndRegisterSpreadsheet requires authenticated session", async () => {
  const jiti = createTestJiti(__filename);
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { createAndRegisterSpreadsheet } = await jiti.import(
      "../src/server/google/create-spreadsheet",
    );

    await assert.rejects(
      () =>
        createAndRegisterSpreadsheet({
          getSession: async () => null,
        }),
      /Missing authenticated session/,
    );
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("createAndRegisterSpreadsheet requires Google tokens", async () => {
  const jiti = createTestJiti(__filename);
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { createAndRegisterSpreadsheet } = await jiti.import(
      "../src/server/google/create-spreadsheet",
    );

    await assert.rejects(
      () =>
        createAndRegisterSpreadsheet({
          getSession: async () => ({ user: { email: "paulo@example.com" } }),
        }),
      /Missing Google tokens/,
    );
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("createAndRegisterSpreadsheet creates and registers manifest", async () => {
  const jiti = createTestJiti(__filename);
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const createCalls = [];
  const registerCalls = [];

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { createAndRegisterSpreadsheet } = await jiti.import(
      "../src/server/google/create-spreadsheet",
    );

    const manifest = await createAndRegisterSpreadsheet({
      getSession: async () => ({
        user: { email: "paulo@example.com" },
        googleTokens: {
          accessToken: "access-123",
          refreshToken: "refresh-456",
          expiresAt: 1730000000,
        },
      }),
      createSpreadsheet: async ({ tokens, title }) => {
        createCalls.push({ tokens, title });
        return { spreadsheetId: "sheet-created" };
      },
      registerSpreadsheetSelection: async ({ spreadsheetId, bootstrapSheetTitles }) => {
        const call = { spreadsheetId };
        if (bootstrapSheetTitles) {
          call.bootstrapSheetTitles = bootstrapSheetTitles;
        }
        registerCalls.push(call);
        return { spreadsheetId, storedAt: 555 }; // not used
      },
      now: () => 999,
      defaultTitle: "Runway Compass", // optional override test
    });

    assert.equal(manifest.spreadsheetId, "sheet-created");
    assert.equal(manifest.storedAt, 555);
    assert.equal(createCalls.length, 1);
    assert.deepEqual(createCalls[0], {
      tokens: {
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: 1730000000,
      },
      title: "Runway Compass",
    });
    assert.equal(registerCalls.length, 1);
    assert.deepEqual(registerCalls[0], {
      spreadsheetId: "sheet-created",
    });
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});
