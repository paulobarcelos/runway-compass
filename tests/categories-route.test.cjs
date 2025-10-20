/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

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

test("categories route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/route",
    );

    const handler = createCategoriesHandler({
      fetchCategories: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/categories");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("categories route maps auth errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/route",
    );

    const handler = createCategoriesHandler({
      fetchCategories: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request("http://localhost/api/categories?spreadsheetId=sheet-123");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("categories route returns data on success", async () => {
  await withEnv(async () => {
    const jiti = createJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/route",
    );

    const handler = createCategoriesHandler({
      fetchCategories: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return [
          {
            categoryId: "cat-1",
            label: "Housing",
            color: "#ff0000",
            rolloverFlag: true,
            sortOrder: 1,
          },
        ];
      },
    });

    const request = new Request("http://localhost/api/categories?spreadsheetId=sheet-123");
    const response = await handler(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      categories: [
        {
          categoryId: "cat-1",
          label: "Housing",
          color: "#ff0000",
          rolloverFlag: true,
          sortOrder: 1,
        },
      ],
    });
  });
});
