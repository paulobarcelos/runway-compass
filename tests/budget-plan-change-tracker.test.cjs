/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

async function loadModules() {
  const jiti = createTestJiti(__filename);
  const gridTransforms = await jiti.import("../src/lib/budget-plan/grid-transforms");
  const changeTracker = await jiti.import("../src/lib/budget-plan/change-tracker");

  return { gridTransforms, changeTracker };
}

function createCategory(overrides = {}) {
  return {
    categoryId: "cat-roll",
    label: "Category",
    color: "#123456",
    description: "",
    flowType: "expense",
    rolloverFlag: true,
    sortOrder: 1,
    monthlyBudget: 200,
    currencyCode: "USD",
    ...overrides,
  };
}

test("createBudgetPlanDraft clones baseline grid data", async () => {
  const { gridTransforms, changeTracker } = await loadModules();
  const { buildBudgetPlanGrid } = gridTransforms;
  const { createBudgetPlanDraft } = changeTracker;

  const grid = buildBudgetPlanGrid({
    categories: [createCategory()],
    budgetPlan: [],
    startDate: new Date("2024-01-01"),
  });

  const draft = createBudgetPlanDraft(grid);

  assert.notEqual(draft.rows[0], grid.rows[0]);
  assert.notEqual(draft.rows[0].cells[0], grid.rows[0].cells[0]);
  assert.equal(draft.rows[0].cells[0].amount, grid.rows[0].cells[0].amount);
});

test("applyMoneyChange validates numeric input", async () => {
  const { gridTransforms, changeTracker } = await loadModules();
  const { buildBudgetPlanGrid } = gridTransforms;
  const { createBudgetPlanDraft, applyMoneyChange } = changeTracker;

  const grid = buildBudgetPlanGrid({
    categories: [createCategory()],
    budgetPlan: [],
    startDate: new Date("2024-01-01"),
  });

  const draft = createBudgetPlanDraft(grid);

  assert.throws(() =>
    applyMoneyChange(draft, { categoryId: "cat-roll", monthIndex: 0, amount: NaN }),
  );
});

test("applyMoneyChange updates amounts and recomputes rollover balances", async () => {
  const { gridTransforms, changeTracker } = await loadModules();
  const { buildBudgetPlanGrid } = gridTransforms;
  const { createBudgetPlanDraft, applyMoneyChange } = changeTracker;

  const grid = buildBudgetPlanGrid({
    categories: [createCategory()],
    budgetPlan: [
      {
        recordId: "rec-jan",
        categoryId: "cat-roll",
        month: 1,
        year: 2024,
        amount: 150,
        rolloverBalance: 0,
        currency: "USD",
      },
      {
        recordId: "rec-feb",
        categoryId: "cat-roll",
        month: 2,
        year: 2024,
        amount: 200,
        rolloverBalance: 0,
        currency: "USD",
      },
    ],
    startDate: new Date("2024-01-01"),
  });

  const original = createBudgetPlanDraft(grid);
  const updated = applyMoneyChange(original, {
    categoryId: "cat-roll",
    monthIndex: 0,
    amount: 100,
    currency: "eur",
  });

  const row = updated.rows[0];

  assert.equal(row.cells[0].amount, 100);
  assert.deepEqual(
    row.cells.slice(0, 4).map((cell) => cell.rolloverBalance),
    [0, 100, 100, 100],
  );
});

test("isBudgetPlanDraftDirty flags changes and resets after revert", async () => {
  const { gridTransforms, changeTracker } = await loadModules();
  const { buildBudgetPlanGrid } = gridTransforms;
  const { createBudgetPlanDraft, applyMoneyChange, isBudgetPlanDraftDirty } =
    changeTracker;

  const grid = buildBudgetPlanGrid({
    categories: [createCategory({ monthlyBudget: 150 })],
    budgetPlan: [],
    startDate: new Date("2024-01-01"),
  });

  const draft = createBudgetPlanDraft(grid);
  assert.equal(isBudgetPlanDraftDirty(draft), false);

  const changed = applyMoneyChange(draft, {
    categoryId: "cat-roll",
    monthIndex: 1,
    amount: 120,
    currency: "usd",
  });

  assert.equal(isBudgetPlanDraftDirty(changed), true);

  const reverted = applyMoneyChange(changed, {
    categoryId: "cat-roll",
    monthIndex: 1,
    amount: 150,
    currency: "usd",
  });

  assert.equal(isBudgetPlanDraftDirty(reverted), false);
});

test("serializeBudgetPlanDraft emits full record list", async () => {
  const { gridTransforms, changeTracker } = await loadModules();
  const { buildBudgetPlanGrid } = gridTransforms;
  const {
    createBudgetPlanDraft,
    applyMoneyChange,
    serializeBudgetPlanDraft,
  } = changeTracker;

  const grid = buildBudgetPlanGrid({
    categories: [
      createCategory({ categoryId: "cat-serial", monthlyBudget: 300, currencyCode: "EUR" }),
    ],
    budgetPlan: [
      {
        recordId: "rec-start",
        categoryId: "cat-serial",
        month: 3,
        year: 2024,
        amount: 320,
        rolloverBalance: 0,
        currency: "EUR",
      },
    ],
    startDate: new Date("2024-03-01"),
  });

  const draft = createBudgetPlanDraft(grid);
  const changed = applyMoneyChange(draft, {
    categoryId: "cat-serial",
    monthIndex: 2,
    amount: 250,
    currency: "eur",
  });

  const records = serializeBudgetPlanDraft(changed);

  assert.equal(records.length, 12);

  const first = records[0];
  assert.equal(first.categoryId, "cat-serial");
  assert.equal(first.month, 3);
  assert.equal(first.year, 2024);
  assert.equal(first.amount, 320);
  assert.equal(first.currency, "EUR");

  const third = records[2];
  assert.equal(third.amount, 250);
  assert.equal(third.rolloverBalance, 0);
  assert.equal(third.currency, "EUR");

  const fourth = records[3];
  assert.equal(fourth.rolloverBalance, 50);
  assert.equal(fourth.currency, "EUR");

  const last = records[records.length - 1];
  assert.equal(last.recordId.startsWith("budget_cat-serial_"), true);
  assert.equal(last.currency, "EUR");
});
