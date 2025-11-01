/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

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
    const jiti = createTestJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/categories-handler",
    );

    const { GET } = createCategoriesHandler({
      fetchCategories: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/categories");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("categories route maps auth errors to 401", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/categories-handler",
    );

    const { GET } = createCategoriesHandler({
      fetchCategories: async () => {
        throw new Error("Missing authenticated session");
      },
    });

    const request = new Request("http://localhost/api/categories?spreadsheetId=sheet-123");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error, "Missing authenticated session");
  });
});

test("categories route returns data on success", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/categories-handler",
    );

    const { GET } = createCategoriesHandler({
      fetchCategories: async ({ spreadsheetId }) => {
        assert.equal(spreadsheetId, "sheet-123");
        return [
          {
            categoryId: "cat-1",
            label: "Housing",
            color: "#ff0000",
            description: "Mortgage",
            sortOrder: 1,
          },
        ];
      },
    });

    const request = new Request("http://localhost/api/categories?spreadsheetId=sheet-123");
    const response = await GET(request);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      categories: [
        {
          categoryId: "cat-1",
          label: "Housing",
          color: "#ff0000",
          description: "Mortgage",
          sortOrder: 1,
        },
      ],
    });
  });
});

test("categories update route requires spreadsheetId query", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/categories-handler",
    );

    const { POST } = createCategoriesHandler({
      saveCategories: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: [] }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing spreadsheetId");
  });
});

test("categories update route validates payload shape", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/categories-handler",
    );

    const { POST } = createCategoriesHandler({
      saveCategories: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/categories?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Missing categories payload");
  });
});

test("categories update route rejects invalid categories", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/categories-handler",
    );

    const { POST } = createCategoriesHandler({
      saveCategories: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/categories?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categories: [
          {
            categoryId: "",
            label: "Housing",
            color: "#ff0000",
            description: "Mortgage",
            sortOrder: 1,
          },
        ],
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Invalid categories payload");
  });
});

test("categories update route rejects legacy fields", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/categories-handler",
    );

    const { POST } = createCategoriesHandler({
      saveCategories: async () => {
        throw new Error("should not be called");
      },
    });

    const request = new Request("http://localhost/api/categories?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categories: [
          {
            categoryId: "cat-1",
            label: "Housing",
            color: "#ff0000",
            description: "Mortgage",
            sortOrder: 1,
            flowType: "expense",
          },
        ],
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "Invalid categories payload");
  });
});

test("categories update route persists records and returns payload", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { createCategoriesHandler } = await jiti.import(
      "../src/app/api/categories/categories-handler",
    );

    const saved = [];

    const { POST } = createCategoriesHandler({
      saveCategories: async ({ spreadsheetId, categories }) => {
        assert.equal(spreadsheetId, "sheet-123");
        saved.push(...categories);
      },
    });

    const payload = [
      {
        categoryId: "cat-1",
        label: "Housing",
        color: "#ff0000",
        description: "Mortgage",
        sortOrder: 1,
      },
    ];

    const request = new Request("http://localhost/api/categories?spreadsheetId=sheet-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: payload }),
    });

    const response = await POST(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(saved, payload);
    assert.deepEqual(body, { categories: payload });
  });
});
