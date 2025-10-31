/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

test("createBlankCategory generates defaults", async () => {
  const jiti = createTestJiti(__filename);
  const { createBlankCategory } = await jiti.import(
    "../src/components/categories/category-helpers",
  );

  const draft = createBlankCategory(5);

  assert.ok(draft.categoryId.length > 0);
  assert.equal(draft.label, "");
  assert.equal(draft.color, "#999999");
  assert.equal(draft.flowType, "expense");
  assert.equal(draft.rolloverFlag, false);
  assert.equal(draft.sortOrder, 5);
  assert.equal(draft.monthlyBudget, "");
  assert.equal(draft.currencyCode, "");
});

test("categoriesEqual compares drafts shallowly", async () => {
  const jiti = createTestJiti(__filename);
  const { categoriesEqual } = await jiti.import(
    "../src/components/categories/category-helpers",
  );

  const a = [
    {
      categoryId: "1",
      label: "A",
      color: "#111111",
      flowType: "expense",
      rolloverFlag: false,
      sortOrder: 1,
      monthlyBudget: "",
      currencyCode: "",
    },
    {
      categoryId: "2",
      label: "B",
      color: "#222222",
      flowType: "income",
      rolloverFlag: true,
      sortOrder: 2,
      monthlyBudget: "500",
      currencyCode: "SEK",
    },
  ];

  const b = a.map((item) => ({ ...item }));

  const c = a.map((item) => ({ ...item }));
  c[1].label = "B updated";

  assert.equal(categoriesEqual(a, b), true);
  assert.equal(categoriesEqual(a, c), false);
});
