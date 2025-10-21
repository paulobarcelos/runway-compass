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

test("accounts route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/route",
    );

    const handler = createAccountsHandler({
      fetchAccounts: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/accounts");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("accounts route maps auth errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/route",
    );

    const handler = createAccountsHandler({
      fetchAccounts: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request("http://localhost/api/accounts?spreadsheetId=sheet-123");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("accounts route returns data on success", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/route",
    );

    const handler = createAccountsHandler({
      fetchAccounts: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return [
          {
            accountId: "acct-1",
            name: "Checking",
            type: "checking",
            currency: "USD",
            includeInRunway: true,
            snapshotFrequency: "monthly",
            lastSnapshotAt: "2025-01-31",
          },
        ];
      },
    });

    const request = new Request("http://localhost/api/accounts?spreadsheetId=sheet-123");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      accounts: [
        {
          accountId: "acct-1",
          name: "Checking",
          type: "checking",
          currency: "USD",
          includeInRunway: true,
          snapshotFrequency: "monthly",
          lastSnapshotAt: "2025-01-31",
        },
      ],
    });
  });
});
