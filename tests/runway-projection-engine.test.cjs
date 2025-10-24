/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

test("buildRunwayProjection merges snapshots, budgets, and cash flows", async () => {
  const jiti = createTestJiti(__filename);
  const { buildRunwayProjection } = await jiti.import(
    "../src/server/projection/runway-projection",
  );

  const rows = buildRunwayProjection({
    snapshots: [
      { accountId: "acct-1", date: "2025-01-01", balance: 8000 },
      { accountId: "acct-1", date: "2025-02-10", balance: 8500 },
      { accountId: "acct-2", date: "2025-02-12", balance: 6500 },
    ],
    budgets: [
      { month: 2, year: 2025, amount: 2000 },
      { month: 2, year: 2025, amount: 500 },
      { month: 3, year: 2025, amount: 2800 },
    ],
    cashFlows: [
      {
        flowId: "income-feb-posted",
        type: "income",
        status: "posted",
        plannedDate: "2025-02-01",
        plannedAmount: 3000,
        actualDate: "2025-02-15",
        actualAmount: 3200,
      },
      {
        flowId: "expense-feb-posted",
        type: "expense",
        status: "posted",
        plannedDate: "2025-02-05",
        plannedAmount: 1500,
        actualDate: "2025-02-20",
        actualAmount: 1700,
      },
      {
        flowId: "income-mar-posted",
        type: "income",
        status: "posted",
        plannedDate: "2025-03-01",
        plannedAmount: 2600,
        actualDate: "2025-03-02",
        actualAmount: 2800,
      },
      {
        flowId: "expense-mar-posted",
        type: "expense",
        status: "posted",
        plannedDate: "2025-03-05",
        plannedAmount: 1400,
        actualDate: "2025-03-05",
        actualAmount: 1500,
      },
      {
        flowId: "income-mar-planned",
        type: "income",
        status: "planned",
        plannedDate: "2025-03-18",
        plannedAmount: 4000,
      },
      {
        flowId: "expense-mar-planned",
        type: "expense",
        status: "planned",
        plannedDate: "2025-03-22",
        plannedAmount: 2200,
      },
      {
        flowId: "void-flow",
        type: "expense",
        status: "void",
        plannedDate: "2025-03-01",
        plannedAmount: 9999,
      },
    ],
    warningBalanceThreshold: 5000,
    dangerBalanceThreshold: 2000,
  });

  assert.equal(rows.length, 2);

  assert.deepEqual(rows[0], {
    month: 2,
    year: 2025,
    startingBalance: 15000,
    actualIncomeTotal: 3200,
    projectedIncomeTotal: 3200,
    actualExpenseTotal: 1700,
    projectedExpenseTotal: 4200,
    actualEndingBalance: 16500,
    projectedEndingBalance: 14000,
    stoplightStatus: "green",
    notes: "",
  });

  assert.deepEqual(rows[1], {
    month: 3,
    year: 2025,
    startingBalance: 14000,
    actualIncomeTotal: 2800,
    projectedIncomeTotal: 6800,
    actualExpenseTotal: 1500,
    projectedExpenseTotal: 6500,
    actualEndingBalance: 15300,
    projectedEndingBalance: 14300,
    stoplightStatus: "green",
    notes: "",
  });
});

test("buildRunwayProjection categorizes stoplight statuses and handles low balances", async () => {
  const jiti = createTestJiti(__filename);
  const { buildRunwayProjection } = await jiti.import(
    "../src/server/projection/runway-projection",
  );

  const rows = buildRunwayProjection({
    snapshots: [{ accountId: "acct-1", date: "2025-01-01", balance: 1000 }],
    budgets: [{ month: 1, year: 2025, amount: 1500 }],
    cashFlows: [
      {
        flowId: "income-feb-planned",
        type: "income",
        status: "planned",
        plannedDate: "2025-02-01",
        plannedAmount: 500,
      },
    ],
    warningBalanceThreshold: 3000,
    dangerBalanceThreshold: 0,
    monthsToProject: 2,
  });

  assert.equal(rows.length, 2);

  assert.equal(rows[0].month, 1);
  assert.equal(rows[0].year, 2025);
  assert.equal(rows[0].projectedEndingBalance, -500);
  assert.equal(rows[0].stoplightStatus, "red");

  assert.equal(rows[1].month, 2);
  assert.equal(rows[1].projectedEndingBalance, 0);
  assert.equal(rows[1].stoplightStatus, "yellow");
});

test("buildRunwayProjection requires at least one snapshot", async () => {
  const jiti = createTestJiti(__filename);
  const { buildRunwayProjection } = await jiti.import(
    "../src/server/projection/runway-projection",
  );

  assert.throws(
    () =>
      buildRunwayProjection({
        snapshots: [],
        budgets: [],
        cashFlows: [],
        warningBalanceThreshold: 1000,
        dangerBalanceThreshold: 500,
      }),
    /No account snapshots/,
  );
});
