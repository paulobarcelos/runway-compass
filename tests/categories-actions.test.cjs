// ABOUTME: Validates categories server actions sanitize payloads and enforce auth.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function buildDeps(overrides = {}) {
  return {
    getSession: async () => ({
      user: { email: "paulo@example.com" },
      googleTokens: {
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 60_000,
      },
    }),
    createSheetsClient: () => ({}),
    createCategoriesRepository: () => ({
      list: async () => [],
      save: async () => {},
    }),
    now: () => new Date("2025-11-04T12:00:00.000Z"),
    ...overrides,
  };
}

test("saveCategories trims fields and resequences sort order", async () => {
  const calls = [];
  const jiti = createTestJiti(__filename);
  const { createCategoriesActions } = await jiti.import(
    "../src/server/categories/categories-service",
  );

  const deps = buildDeps({
    createCategoriesRepository: () => ({
      list: async () => [],
      save: async (payload) => {
        calls.push(payload);
      },
    }),
  });

  const { saveCategories } = createCategoriesActions(deps);

  const result = await saveCategories({
    spreadsheetId: "sheet-123",
    categories: [
      {
        categoryId: " cat-travel ",
        label: " Travel ",
        color: " #FF0000 ",
        description: "  flights ",
        sortOrder: 7,
      },
      {
        categoryId: "cat-supplies",
        label: "Supplies",
        color: "#00ff00",
        description: "office",
        sortOrder: 2,
      },
    ],
  });

  assert.equal(calls.length, 1, "repository.save called");
  assert.deepEqual(
    calls[0],
    [
      {
        categoryId: "cat-supplies",
        label: "Supplies",
        color: "#00ff00",
        description: "office",
        sortOrder: 1,
      },
      {
        categoryId: "cat-travel",
        label: "Travel",
        color: "#FF0000",
        description: "flights",
        sortOrder: 2,
      },
    ],
    "sanitized payload resequenced & trimmed",
  );
  assert.deepEqual(result, {
    categories: calls[0],
    updatedAt: "2025-11-04T12:00:00.000Z",
  });
});

test("saveCategories preserves blank color values", async () => {
  const captured = [];
  const jiti = createTestJiti(__filename);
  const { createCategoriesActions } = await jiti.import(
    "../src/server/categories/categories-service",
  );

  const deps = buildDeps({
    createCategoriesRepository: () => ({
      list: async () => [],
      save: async (payload) => {
        captured.push(payload);
      },
    }),
  });

  const { saveCategories } = createCategoriesActions(deps);

  await saveCategories({
    spreadsheetId: "sheet-blank",
    categories: [
      {
        categoryId: "cat-alpha",
        label: "Alpha",
        color: "",
        description: "",
        sortOrder: 4,
      },
    ],
  });

  assert.equal(captured.length, 1, "repository.save invoked");
  assert.equal(captured[0][0].color, "", "blank color persisted");
  assert.equal(captured[0][0].sortOrder, 1, "sort order resequenced");
});

test("getCategories sanitizes fetched rows", async () => {
  const jiti = createTestJiti(__filename);
  const { createCategoriesActions } = await jiti.import(
    "../src/server/categories/categories-service",
  );

  const deps = buildDeps({
    createCategoriesRepository: () => ({
      list: async () => [
        {
          categoryId: "cat-beta ",
          label: " Beta ",
          color: " #ABCDEF ",
          description: " second ",
          sortOrder: 5,
        },
        {
          categoryId: "cat-alpha",
          label: "Alpha",
          color: "#123456",
          description: "first",
          sortOrder: 1,
        },
      ],
      save: async () => {},
    }),
  });

  const { getCategories } = createCategoriesActions(deps);
  const categories = await getCategories({ spreadsheetId: "sheet-123" });

  assert.deepEqual(categories, [
    {
      categoryId: "cat-alpha",
      label: "Alpha",
      color: "#123456",
      description: "first",
      sortOrder: 1,
    },
    {
      categoryId: "cat-beta",
      label: "Beta",
      color: "#ABCDEF",
      description: "second",
      sortOrder: 2,
    },
  ]);
});

test("actions enforce spreadsheet id & auth", async () => {
  const jiti = createTestJiti(__filename);
  const { createCategoriesActions } = await jiti.import(
    "../src/server/categories/categories-service",
  );

  const { getCategories, saveCategories } = createCategoriesActions(
    buildDeps({
      getSession: async () => null,
    }),
  );

  await assert.rejects(
    () => getCategories({ spreadsheetId: "" }),
    /Missing spreadsheetId/,
    "rejects missing spreadsheet",
  );

  await assert.rejects(
    () => saveCategories({ spreadsheetId: "sheet-123", categories: [] }),
    /Missing authenticated session/,
    "rejects unauthenticated",
  );
});
