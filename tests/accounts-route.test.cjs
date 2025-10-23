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

test("accounts route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/accounts-handler",
    );

    const { GET } = createAccountsHandler({
      fetchAccounts: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/accounts");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("accounts route maps auth errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/accounts-handler",
    );

    const { GET } = createAccountsHandler({
      fetchAccounts: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request("http://localhost/api/accounts?spreadsheetId=sheet-123");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("accounts route returns data on success with warnings and errors", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/accounts-handler",
    );

    const { GET } = createAccountsHandler({
      fetchAccounts: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return {
          accounts: [
            {
              accountId: "acct-1",
              name: "Checking",
              type: "checking",
              currency: "USD",
              includeInRunway: true,
              sortOrder: 1,
              lastSnapshotAt: "2025-01-31",
            },
          ],
          warnings: [
            {
              rowNumber: 3,
              code: "invalid_sort_order",
              message: 'Sort order value "not-a-number" is not a valid integer',
            },
          ],
          errors: [
            {
              code: "range_error",
              message: "accounts sheet range accounts!A1:G1000 could not be read",
            },
          ],
        };
      },
    });

    const request = new Request("http://localhost/api/accounts?spreadsheetId=sheet-123");
    const response = await GET(request);
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
          sortOrder: 1,
          lastSnapshotAt: "2025-01-31",
        },
      ],
      warnings: [
        {
          rowNumber: 3,
          code: "invalid_sort_order",
          message: 'Sort order value "not-a-number" is not a valid integer',
        },
      ],
      errors: [
        {
          code: "range_error",
          message: "accounts sheet range accounts!A1:G1000 could not be read",
        },
      ],
    });
  });
});

test("accounts update route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/accounts-handler",
    );

    const { POST } = createAccountsHandler({
      saveAccounts: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: [] }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("accounts update route validates payload shape", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/accounts-handler",
    );

    const { POST } = createAccountsHandler({
      saveAccounts: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/accounts?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing accounts payload");
  });
});

test("accounts update route persists records and returns payload with diagnostics", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/accounts-handler",
    );

    const saved = [];

    const { POST } = createAccountsHandler({
      fetchAccounts: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return {
          accounts: [
            {
              accountId: "acct-1",
              name: "Checking",
              type: "checking",
              currency: "USD",
              includeInRunway: true,
              sortOrder: 1,
              lastSnapshotAt: "2025-01-31",
            },
          ],
          warnings: [],
          errors: [
            {
              code: "header_mismatch",
              message:
                "accounts sheet headers must match: account_id, name, type, currency, include_in_runway, sort_order, last_snapshot_at",
            },
          ],
        };
      },
      saveAccounts: async ({ spreadsheetId, accounts }) => {
        assert.equal(spreadsheetId, "sheet-123");
        saved.push(...accounts);
      },
      fetchSnapshots: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return [
          {
            snapshotId: "snap-keep",
            accountId: "acct-1",
            date: "2024-09-30",
            balance: 500,
            note: "",
          },
        ];
      },
      saveSnapshots: async ({ spreadsheetId, snapshots }) => {
        assert.equal(spreadsheetId, "sheet-123");
        assert.deepEqual(snapshots, [
          {
            snapshotId: "snap-keep",
            accountId: "acct-1",
            date: "2024-09-30",
            balance: 500,
            note: "",
          },
        ]);
      },
    });

    const payload = [
      {
        accountId: "acct-1",
        name: "Checking",
        type: "checking",
        currency: "USD",
        includeInRunway: true,
        sortOrder: 1,
        lastSnapshotAt: "2025-01-31",
      },
    ];

    const request = new Request("http://localhost/api/accounts?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: payload }),
    });

    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(saved, payload);
    assert.deepEqual(body, {
      accounts: payload,
      warnings: [],
      errors: [
        {
          code: "header_mismatch",
          message:
            "accounts sheet headers must match: account_id, name, type, currency, include_in_runway, sort_order, last_snapshot_at",
        },
      ],
    });
  });
});

test("accounts update route removes snapshots for deleted accounts", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createAccountsHandler } = await jiti.import(
      "../src/app/api/accounts/accounts-handler",
    );

    const savedSnapshots = [];
    const { POST } = createAccountsHandler({
      fetchAccounts: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return {
          accounts: [
            {
              accountId: "acct-1",
              name: "Checking",
              type: "checking",
              currency: "USD",
              includeInRunway: true,
              sortOrder: 1,
              lastSnapshotAt: "2024-10-01",
            },
          ],
          warnings: [],
          errors: [],
        };
      },
      saveAccounts: async () => {},
      fetchSnapshots: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");

        return [
          {
            snapshotId: "snap-1",
            accountId: "acct-1",
            date: "2024-10-01",
            balance: 1200,
            note: "",
          },
          {
            snapshotId: "snap-2",
            accountId: "acct-2",
            date: "2024-10-02",
            balance: 900,
            note: "",
          },
        ];
      },
      saveSnapshots: async ({ spreadsheetId, snapshots }) => {
        assert.equal(spreadsheetId, "sheet-123");
        savedSnapshots.push(...snapshots);
      },
    });

    const request = new Request("http://localhost/api/accounts?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: [
          {
            accountId: "acct-1",
            name: "Checking",
            type: "checking",
            currency: "USD",
            includeInRunway: true,
            sortOrder: 1,
            lastSnapshotAt: "2024-10-01",
          },
        ],
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(savedSnapshots, [
      {
        snapshotId: "snap-1",
        accountId: "acct-1",
        date: "2024-10-01",
        balance: 1200,
        note: "",
      },
    ]);
    assert.deepEqual(payload.warnings, []);
    assert.deepEqual(payload.errors, []);
  });
});
