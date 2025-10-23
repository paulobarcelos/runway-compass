/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

async function loadGridTransforms() {
  const jiti = createTestJiti(__filename);
  return jiti.import("../src/lib/budget-plan/grid-transforms");
}

function createCategory(overrides = {}) {
  return {
    categoryId: "cat-1",
    label: "Category 1",
    color: "#000000",
    rolloverFlag: false,
    sortOrder: 1,
    monthlyBudget: 0,
    currencyCode: "USD",
    ...overrides,
  };
}

test("buildBudgetPlanGrid sorts categories by sortOrder", async () => {
  const { buildBudgetPlanGrid } = await loadGridTransforms();

  const categories = [
    createCategory({ categoryId: "cat-b", label: "B", sortOrder: 20 }),
    createCategory({ categoryId: "cat-a", label: "A", sortOrder: 10 }),
  ];

  const grid = buildBudgetPlanGrid({
    categories,
    budgetPlan: [],
    startDate: new Date("2024-01-10"),
  });

  assert.deepEqual(
    grid.rows.map((row) => row.category.categoryId),
    ["cat-a", "cat-b"],
  );
});

test("buildBudgetPlanGrid creates 12 month rolling horizon", async () => {
  const { buildBudgetPlanGrid } = await loadGridTransforms();

  const grid = buildBudgetPlanGrid({
    categories: [createCategory()],
    budgetPlan: [],
    startDate: new Date("2024-05-15"),
  });

  assert.equal(grid.months.length, 12);
  assert.deepEqual(
    grid.months.map((month) => month.id),
    [
      "2024-05",
      "2024-06",
      "2024-07",
      "2024-08",
      "2024-09",
      "2024-10",
      "2024-11",
      "2024-12",
      "2025-01",
      "2025-02",
      "2025-03",
      "2025-04",
    ],
  );
});

test("buildBudgetPlanGrid seeds blank months from monthlyBudget", async () => {
  const { buildBudgetPlanGrid } = await loadGridTransforms();

  const grid = buildBudgetPlanGrid({
    categories: [createCategory({ monthlyBudget: 250 })],
    budgetPlan: [],
    startDate: new Date("2024-02-01"),
  });

  const row = grid.rows[0];

  assert.equal(row.cells.length, 12);
  assert.equal(
    row.cells.every((cell) => cell.amount === 250 && cell.isGenerated === true),
    true,
  );
});

test("buildBudgetPlanGrid uses existing amounts when present", async () => {
  const { buildBudgetPlanGrid } = await loadGridTransforms();

  const grid = buildBudgetPlanGrid({
    categories: [createCategory({ categoryId: "cat-a", monthlyBudget: 120 })],
    budgetPlan: [
      {
        recordId: "rec-existing",
        categoryId: "cat-a",
        month: 2,
        year: 2024,
        amount: 400,
        rolloverBalance: 0,
      },
    ],
    startDate: new Date("2024-02-01"),
  });

  const [first, second] = grid.rows[0].cells;

  assert.equal(first.amount, 400);
  assert.equal(first.isGenerated, false);
  assert.equal(second.amount, 120);
  assert.equal(second.isGenerated, true);
});

test("buildBudgetPlanGrid computes rollover balances for rollover categories", async () => {
  const { buildBudgetPlanGrid } = await loadGridTransforms();

  const grid = buildBudgetPlanGrid({
    categories: [createCategory({ rolloverFlag: true, monthlyBudget: 200 })],
    budgetPlan: [
      {
        recordId: "rec-jan",
        categoryId: "cat-1",
        month: 1,
        year: 2024,
        amount: 150,
        rolloverBalance: 0,
      },
      {
        recordId: "rec-feb",
        categoryId: "cat-1",
        month: 2,
        year: 2024,
        amount: 250,
        rolloverBalance: 0,
      },
      {
        recordId: "rec-mar",
        categoryId: "cat-1",
        month: 3,
        year: 2024,
        amount: 100,
        rolloverBalance: 0,
      },
    ],
    startDate: new Date("2024-01-01"),
  });

  const row = grid.rows[0];
  const rolloverBalances = row.cells.map((cell) => cell.rolloverBalance);

  assert.deepEqual(rolloverBalances.slice(0, 6), [0, 50, 0, 100, 100, 100]);
});

test("buildBudgetPlanGrid generates deterministic record ids for missing months", async () => {
  const { buildBudgetPlanGrid, generateBudgetPlanRecordId } =
    await loadGridTransforms();

  const grid = buildBudgetPlanGrid({
    categories: [createCategory({ categoryId: "cat-123", monthlyBudget: 75 })],
    budgetPlan: [
      {
        recordId: "rec-existing",
        categoryId: "cat-123",
        month: 5,
        year: 2024,
        amount: 80,
        rolloverBalance: 0,
      },
    ],
    startDate: new Date("2024-05-01"),
  });

  const row = grid.rows[0];

  assert.equal(row.cells[0].recordId, "rec-existing");

  const second = row.cells[1];
  assert.equal(
    second.recordId,
    generateBudgetPlanRecordId({
      categoryId: "cat-123",
      year: 2024,
      month: 6,
    }),
  );
  assert.equal(second.isGenerated, true);
});
