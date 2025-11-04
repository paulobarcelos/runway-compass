/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

test("builds shared query helpers", async (t) => {
  const jiti = createTestJiti(__filename);
  const { queryKeys, createQueryClient, formatMutationError } = await jiti.import(
    "../src/lib/query",
  );

  await t.test("query key builders", () => {
    assert.deepEqual(queryKeys.sheet("abc"), ["sheet", "abc"]);
    assert.deepEqual(queryKeys.categories("xyz"), ["sheet", "xyz", "categories"]);
    assert.deepEqual(queryKeys.budgetPlan("xyz"), ["sheet", "xyz", "budget-plan"]);
  });

  await t.test("createQueryClient", () => {
    const client = createQueryClient();
    const defaults = client.getDefaultOptions();

    assert.equal(defaults.queries?.staleTime, 30_000);
    assert.equal(defaults.queries?.gcTime, 5 * 60_000);
    assert.equal(defaults.queries?.retry, 2);
    assert.equal(defaults.mutations?.retry, 3);

    client.clear();
  });

  await t.test("formatMutationError", () => {
    assert.equal(formatMutationError(new Error("Boom")), "Boom");
    assert.equal(formatMutationError(null), "Sync failed. Please retry.");
  });
});
