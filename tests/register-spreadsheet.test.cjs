// ABOUTME: Covers registering spreadsheet selections via server helpers.
// ABOUTME: Ensures Google clients and meta persistence work together.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

test("registerSpreadsheetSelection requires authenticated session", async () => {
  const loader = createJiti(__filename, { cache: false });
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { registerSpreadsheetSelection } = loader(
      "../src/server/google/register-spreadsheet",
    );

    await assert.rejects(
      () =>
        registerSpreadsheetSelection({
          spreadsheetId: "sheet-123",
          getSession: async () => null,
        }),
      /Missing authenticated session/,
    );
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("registerSpreadsheetSelection requires Google tokens", async () => {
  const loader = createJiti(__filename, { cache: false });
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { registerSpreadsheetSelection } = loader(
      "../src/server/google/register-spreadsheet",
    );

    await assert.rejects(
      () =>
        registerSpreadsheetSelection({
          spreadsheetId: "sheet-123",
          getSession: async () => ({ user: { email: "paulo@example.com" } }),
        }),
      /Missing Google tokens/,
    );
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("registerSpreadsheetSelection stores meta and returns manifest", async () => {
  const loader = createJiti(__filename, { cache: false });
  const metaCalls = [];
  let receivedTokens;
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { registerSpreadsheetSelection } = loader(
      "../src/server/google/register-spreadsheet",
    );

    const manifest = await registerSpreadsheetSelection({
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
      storeSelectedSpreadsheetMeta: async (payload) => {
        metaCalls.push(payload);
      },
      now: () => 1234,
    });

    assert.deepEqual(receivedTokens, {
      accessToken: "access-123",
      refreshToken: "refresh-456",
      expiresAt: 1730000000,
    });

    assert.equal(metaCalls.length, 1);
    assert.deepEqual(metaCalls[0], {
      sheets: { type: "sheets" },
      spreadsheetId: "sheet-123",
    });

    assert.deepEqual(manifest, {
      spreadsheetId: "sheet-123",
      storedAt: 1234,
    });
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});
