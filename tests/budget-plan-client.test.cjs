/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

test("budget plan client API helpers", async (t) => {
  const jiti = createTestJiti(__filename);
  const clientModule = await jiti.import("../src/lib/api/budget-plan-client");
  const { fetchBudgetPlan, saveBudgetPlan, BudgetPlanClientError } = clientModule;

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

  await t.test("fetchBudgetPlan requests spreadsheet data and returns payload", async () => {
    await withMockedFetch(
      async (url) => {
        assert.equal(url, "/api/budget-plan?spreadsheetId=sheet-123");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            budgetPlan: [
              {
                recordId: "rec-1",
                categoryId: "cat-1",
                month: 1,
                year: 2025,
                amount: 120,
                rolloverBalance: 0,
                currency: "USD",
              },
            ],
            meta: { start: "2025-01-01", months: 3 },
          }),
        };
      },
      async ({ calls }) => {
        const payload = await fetchBudgetPlan("sheet-123");
        assert.equal(calls.length, 1);
        assert.deepEqual(payload, {
          budgetPlan: [
            {
              recordId: "rec-1",
              categoryId: "cat-1",
              month: 1,
              year: 2025,
              amount: 120,
              rolloverBalance: 0,
              currency: "USD",
            },
          ],
          meta: { start: "2025-01-01", months: 3 },
        });
      },
    );
  });

  await t.test("fetchBudgetPlan throws when metadata missing", async () => {
    await withMockedFetch(
      async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          budgetPlan: [],
        }),
      }),
      async () => {
        await assert.rejects(
          () => fetchBudgetPlan("sheet-123"),
          (error) => {
            assert.equal(error instanceof BudgetPlanClientError, true);
            assert.equal(error.message, "Failed to fetch budget plan");
            return true;
          },
        );
      },
    );
  });

  await t.test("fetchBudgetPlan throws BudgetPlanClientError on non-200 response", async () => {
    await withMockedFetch(
      async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: "Missing authenticated session" }),
      }),
      async () => {
        await assert.rejects(
          () => fetchBudgetPlan("sheet-999"),
          (error) => {
            assert.equal(error instanceof BudgetPlanClientError, true);
            assert.equal(error.message, "Missing authenticated session");
            assert.equal(error.status, 401);
            return true;
          },
        );
      },
    );
  });

  await t.test("fetchBudgetPlan falls back to default message when error missing", async () => {
    await withMockedFetch(
      async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
      async () => {
        await assert.rejects(
          () => fetchBudgetPlan("sheet-xyz"),
          (error) => {
            assert.equal(error instanceof BudgetPlanClientError, true);
            assert.equal(error.message, "Failed to fetch budget plan");
            assert.equal(error.status, 500);
            return true;
          },
        );
      },
    );
  });

  await t.test("saveBudgetPlan posts records and returns updated payload", async () => {
    await withMockedFetch(
      async (url, options) => {
        assert.equal(url, "/api/budget-plan?spreadsheetId=sheet-abc");
        assert.equal(options?.method, "POST");
        assert.equal(options?.headers?.["Content-Type"], "application/json");

        const parsedBody = JSON.parse(options?.body ?? "{}");
        assert.deepEqual(parsedBody, {
          budgetPlan: [
            {
              recordId: "rec-1",
              categoryId: "cat-1",
              month: 1,
              year: 2025,
              amount: 100,
              rolloverBalance: 0,
              currency: "EUR",
            },
          ],
          meta: { start: "2025-02-01", months: 2 },
        });

        return {
          ok: true,
          status: 200,
          json: async () => ({
            budgetPlan: [
              {
                recordId: "rec-1",
                categoryId: "cat-1",
                month: 1,
                year: 2025,
                amount: 110,
                rolloverBalance: 10,
                currency: "EUR",
              },
            ],
            meta: { start: "2025-02-01", months: 2 },
          }),
        };
      },
      async () => {
        const result = await saveBudgetPlan(
          "sheet-abc",
          [
            {
              recordId: "rec-1",
              categoryId: "cat-1",
              month: 1,
              year: 2025,
              amount: 100,
              rolloverBalance: 0,
              currency: "EUR",
            },
          ],
          { start: "2025-02-01", months: 2 },
        );

        assert.deepEqual(result, {
          budgetPlan: [
            {
              recordId: "rec-1",
              categoryId: "cat-1",
              month: 1,
              year: 2025,
              amount: 110,
              rolloverBalance: 10,
              currency: "EUR",
            },
          ],
          meta: { start: "2025-02-01", months: 2 },
        });
      },
    );
  });

  await t.test("saveBudgetPlan throws BudgetPlanClientError on failure", async () => {
    await withMockedFetch(
      async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "Sheet write failed" }),
      }),
      async () => {
        await assert.rejects(
          () =>
            saveBudgetPlan(
              "sheet-abc",
              [
                {
                  recordId: "rec-1",
                  categoryId: "cat-1",
                  month: 1,
                  year: 2025,
                  amount: 100,
                  rolloverBalance: 0,
                  currency: "USD",
                },
              ],
              { start: "2025-02-01", months: 2 },
            ),
          (error) => {
            assert.equal(error instanceof BudgetPlanClientError, true);
            assert.equal(error.message, "Sheet write failed");
            assert.equal(error.status, 500);
            return true;
          },
        );
      },
    );
  });
});
