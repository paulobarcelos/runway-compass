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

test("snapshots route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createSnapshotsHandler } = await jiti.import(
      "../src/app/api/snapshots/snapshots-handler",
    );

    const { GET } = createSnapshotsHandler({
      fetchSnapshots: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/snapshots");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("snapshots route returns data on success", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createSnapshotsHandler } = await jiti.import(
      "../src/app/api/snapshots/snapshots-handler",
    );

    const { GET } = createSnapshotsHandler({
      fetchSnapshots: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return [
          {
            snapshotId: "snap-1",
            accountId: "acct-1",
            date: "2025-01-31",
            balance: 1234.56,
            note: "Month end",
          },
        ];
      },
    });

    const request = new Request("http://localhost/api/snapshots?spreadsheetId=sheet-123");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      snapshots: [
        {
          snapshotId: "snap-1",
          accountId: "acct-1",
          date: "2025-01-31",
          balance: 1234.56,
          note: "Month end",
        },
      ],
    });
  });
});

test("snapshots create route validates payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createSnapshotsHandler } = await jiti.import(
      "../src/app/api/snapshots/snapshots-handler",
    );

    const { POST } = createSnapshotsHandler({
      appendSnapshot: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/snapshots?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing snapshot payload");
  });
});

test("snapshots create route appends snapshot and returns payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createSnapshotsHandler } = await jiti.import(
      "../src/app/api/snapshots/snapshots-handler",
    );

    const saved = [];

    const { POST } = createSnapshotsHandler({
      appendSnapshot: async ({ spreadsheetId, snapshot }) => {
        assert.equal(spreadsheetId, "sheet-123");
        saved.push(snapshot);
        return snapshot;
      },
    });

    const payload = {
      accountId: "acct-1",
      date: "2025-01-31",
      balance: 1234.56,
      note: "Month end",
    };

    const request = new Request("http://localhost/api/snapshots?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: payload }),
    });

    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].accountId, payload.accountId);
    assert.equal(body.snapshot.accountId, payload.accountId);
    assert.ok(saved[0].snapshotId, "snapshot should have id");
  });
});
