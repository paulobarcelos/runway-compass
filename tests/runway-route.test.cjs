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

test("runway route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRunwayHandler } = await jiti.import(
      "../src/app/api/runway/runway-handler",
    );

    const { GET } = createRunwayHandler({
      fetchRunwayProjection: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/runway");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("runway route maps auth errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRunwayHandler } = await jiti.import(
      "../src/app/api/runway/runway-handler",
    );

    const { GET } = createRunwayHandler({
      fetchRunwayProjection: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request(
      "http://localhost/api/runway?spreadsheetId=sheet-123",
    );
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("runway route returns projection data on success", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createRunwayHandler } = await jiti.import(
      "../src/app/api/runway/runway-handler",
    );

    const { GET } = createRunwayHandler({
      fetchRunwayProjection: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-abc");
        return [
          {
            month: 1,
            year: 2025,
            startingBalance: 10000,
            incomeTotal: 6000,
            expenseTotal: 4000,
            endingBalance: 12000,
            stoplightStatus: "green",
            notes: "stable",
          },
        ];
      },
    });

    const request = new Request(
      "http://localhost/api/runway?spreadsheetId=sheet-abc",
    );
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      runway: [
        {
          month: 1,
          year: 2025,
          startingBalance: 10000,
          incomeTotal: 6000,
          expenseTotal: 4000,
          endingBalance: 12000,
          stoplightStatus: "green",
          notes: "stable",
        },
      ],
    });
  });
});
