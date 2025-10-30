/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");
const { CASH_FLOW_EXPECTED_ENTRIES } = require("./fixtures/cash-flow-ledger-fixture.cjs");

test("refreshRunwayProjection recomputes projection rows", async () => {
  const jiti = createTestJiti(__filename);
  const saved = [];

  const { createRunwayProjectionRefresher } = await jiti.import(
    "../src/server/projection/runway-projection-refresh",
  );

  const refresh = createRunwayProjectionRefresher({
    loadBudgets: async () => [
      { recordId: "budget-1", categoryId: "cat-rent", month: 2, year: 2025, amount: 1800, rolloverBalance: 0 },
      { recordId: "budget-2", categoryId: "cat-consulting", month: 2, year: 2025, amount: 3500, rolloverBalance: 0 },
    ],
    loadCashFlows: async () => CASH_FLOW_EXPECTED_ENTRIES,
    loadSnapshots: async () => [
      { snapshotId: "snap-1", accountId: "acct-operating", date: "2025-02-01", balance: 12000, note: "" },
    ],
    loadAccounts: async () => ({
      accounts: [
        {
          accountId: "acct-operating",
          name: "Operating",
          type: "checking",
          currency: "USD",
          includeInRunway: true,
          sortOrder: 0,
          lastSnapshotAt: "2025-02-01",
        },
      ],
      warnings: [],
      errors: [],
    }),
    saveProjection: async ({ rows }) => {
      saved.push(rows);
    },
    now: () => new Date("2025-03-01T12:00:00Z"),
  });

  const result = await refresh({ spreadsheetId: "sheet-123" });

  assert.equal(saved.length, 1);
  assert.ok(saved[0].length > 0);
  assert.equal(result.updatedAt, "2025-03-01T12:00:00.000Z");
  assert.equal(result.rowsWritten, saved[0].length);
});

test("refreshRunwayProjection ignores accounts excluded from runway", async () => {
  const jiti = createTestJiti(__filename);
  const saved = [];

  const { createRunwayProjectionRefresher } = await jiti.import(
    "../src/server/projection/runway-projection-refresh",
  );

  const refresh = createRunwayProjectionRefresher({
    loadBudgets: async () => [],
    loadCashFlows: async () => [],
    loadSnapshots: async () => [
      { snapshotId: "snap-1", accountId: "acct-off", date: "2025-02-01", balance: 5000, note: "" },
    ],
    loadAccounts: async () => ({
      accounts: [
        {
          accountId: "acct-off",
          name: "Off books",
          type: "savings",
          currency: "USD",
          includeInRunway: false,
          sortOrder: 0,
          lastSnapshotAt: "2025-02-01",
        },
      ],
      warnings: [],
      errors: [],
    }),
    saveProjection: async ({ rows }) => {
      saved.push(rows);
    },
  });

  await assert.rejects(() => refresh({ spreadsheetId: "sheet-xyz" }), /No account snapshots/);
  assert.equal(saved.length, 0);
});
