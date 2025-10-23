/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

async function withMockedFetch(handler, run) {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };

  try {
    await run({ calls });
  } finally {
    global.fetch = originalFetch;
  }
}

test("fetchRunwayProjection requests runway data and returns rows", async () => {
  const jiti = createTestJiti(__filename);
  const clientModule = await jiti.import("../src/lib/api/runway-client");
  const { fetchRunwayProjection } = clientModule;

  await withMockedFetch(
    async (url) => {
      assert.equal(url, "/api/runway?spreadsheetId=sheet-123");
      return {
        ok: true,
        status: 200,
        json: async () => ({
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
        }),
      };
    },
    async () => {
      const records = await fetchRunwayProjection("sheet-123");
      assert.deepEqual(records, [
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
      ]);
    },
  );
});

test("fetchRunwayProjection throws RunwayClientError on failure", async () => {
  const jiti = createTestJiti(__filename);
  const clientModule = await jiti.import("../src/lib/api/runway-client");
  const { fetchRunwayProjection, RunwayClientError } = clientModule;

  await withMockedFetch(
    async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: "Missing authenticated session" }),
    }),
    async () => {
      await assert.rejects(
        () => fetchRunwayProjection("sheet-abc"),
        (error) => {
          assert.equal(error instanceof RunwayClientError, true);
          assert.equal(error.message, "Missing authenticated session");
          assert.equal(error.status, 401);
          return true;
        },
      );
    },
  );
});

test("fetchRunwayProjection uses default message when error missing", async () => {
  const jiti = createTestJiti(__filename);
  const clientModule = await jiti.import("../src/lib/api/runway-client");
  const { fetchRunwayProjection, RunwayClientError } = clientModule;

  await withMockedFetch(
    async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }),
    async () => {
      await assert.rejects(
        () => fetchRunwayProjection("sheet-xyz"),
        (error) => {
          assert.equal(error instanceof RunwayClientError, true);
          assert.equal(error.message, "Failed to fetch runway projection");
          assert.equal(error.status, 500);
          return true;
        },
      );
    },
  );
});
