/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

const EXPECTED_SCHEMAS = [
  {
    title: "_meta",
    headers: ["key", "value"],
    hidden: true,
  },
  {
    title: "categories",
    headers: [
      "category_id",
      "label",
      "color",
      "rollover_flag",
      "sort_order",
      "monthly_budget",
      "currency_code",
    ],
  },
  {
    title: "accounts",
    headers: [
      "account_id",
      "name",
      "type",
      "currency",
      "include_in_runway",
      "sort_order",
      "last_snapshot_at",
    ],
  },
  {
    title: "snapshots",
    headers: ["snapshot_id", "account_id", "date", "balance", "note"],
  },
  {
    title: "budget_plan",
    headers: [
      "record_id",
      "category_id",
      "month",
      "year",
      "amount",
      "rollover_balance",
    ],
  },
  {
    title: "actuals",
    headers: [
      "txn_id",
      "account_id",
      "date",
      "category_id",
      "amount",
      "status",
      "entry_mode",
      "note",
    ],
  },
  {
    title: "future_events",
    headers: [
      "event_id",
      "type",
      "account_id",
      "category_id",
      "start_month",
      "end_month",
      "frequency",
      "amount",
      "status",
      "linked_txn_id",
    ],
  },
  {
    title: "runway_projection",
    headers: [
      "month",
      "year",
      "starting_balance",
      "income_total",
      "expense_total",
      "ending_balance",
      "stoplight_status",
      "notes",
    ],
  },
];

test("sheet schemas export expected titles and headers", async () => {
  const jiti = createTestJiti(__filename);
  const sheetSchemas = await jiti.import("../src/server/google/sheet-schemas");

  assert.ok(
    Array.isArray(sheetSchemas.REQUIRED_SHEETS),
    "REQUIRED_SHEETS must be an array",
  );

  const titles = sheetSchemas.REQUIRED_SHEETS.map((schema) => schema.title);

  assert.deepEqual(
    titles,
    EXPECTED_SCHEMAS.map((schema) => schema.title),
  );

  for (const expected of EXPECTED_SCHEMAS) {
    const schema = sheetSchemas.REQUIRED_SHEETS.find(
      (item) => item.title === expected.title,
    );

    assert.ok(schema, `schema for ${expected.title} missing`);
    assert.deepEqual(schema.headers, expected.headers);

    if (expected.hidden) {
      assert.equal(schema.hidden, true);
    } else {
      assert.ok(!schema.hidden, `${expected.title} should not be hidden`);
    }
  }
});
