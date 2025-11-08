// ABOUTME: Verifies useCategories hook wiring with React Query and server action stubs.
/* eslint-disable @typescript-eslint/no-require-imports */
require("./helpers/setup-dom.cjs");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const React = require("react");
const { act } = require("react");
const { createRoot } = require("react-dom/client");
const tsnode = require("ts-node");
const tsconfigPaths = require("tsconfig-paths");
const tsconfig = require("../tsconfig.json");
const { createTestJiti } = require("./helpers/create-jiti");

const stubJiti = createTestJiti(__filename);
const {
  __setCategoriesQueryResponse,
  __setCategoriesMutationResponse,
  __setCategoriesMutationError,
  __getCategoriesCalls,
  __getSaveCategoriesPayloads,
  __resetCategoriesActionsStub,
} = stubJiti("./helpers/stubs/categories-actions");

const originalConsoleError = console.error;

tsnode.register({
  transpileOnly: true,
  project: path.resolve(__dirname, "../tsconfig.json"),
  compilerOptions: {
    module: "commonjs",
    jsx: "react-jsx",
    moduleResolution: "node",
  },
});

tsconfigPaths.register({
  baseUrl: path.resolve(__dirname, ".."),
  paths: tsconfig.compilerOptions?.paths ?? {},
});

function stubAliases() {
  return {
    "@/app/(authenticated)/actions/categories-actions": path.resolve(
      __dirname,
      "helpers/stubs/categories-actions.ts",
    ),
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(condition, description, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = condition();
    if (result) {
      return result;
    }
    await flushMicrotasks();
  }

  throw new Error(`Timeout waiting for ${description}`);
}

async function renderUseCategories(initialSpreadsheetId) {
  const jiti = createTestJiti(__filename, { alias: stubAliases() });
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const { useCategories } = await jiti.import(
    "../src/components/categories/use-categories",
  );

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  const setCalls = [];
  const originalSetQueryData = queryClient.setQueryData.bind(queryClient);
  queryClient.setQueryData = (key, updater, options) => {
    setCalls.push({ key, value: updater });
    return originalSetQueryData(key, updater, options);
  };

  let latest;
  let currentId = initialSpreadsheetId;

  function TestHarness({ spreadsheetId }) {
    latest = useCategories(spreadsheetId);
    // Touch query data so React Query tracks usage for re-render assertions.
    void latest.query.data;
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  async function renderWithId(spreadsheetId) {
    currentId = spreadsheetId;
    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(TestHarness, { spreadsheetId: currentId }),
        ),
      );
    });
    await flushMicrotasks();
  }

  await renderWithId(currentId);

  return {
    get result() {
      return latest;
    },
    async rerender(spreadsheetId) {
      await renderWithId(spreadsheetId);
    },
    async flush() {
      await flushMicrotasks();
    },
    async waitForCondition(check, description) {
      return waitFor(() => check(latest), description);
    },
    getQueryData(queryKey) {
      return queryClient.getQueryData(queryKey);
    },
    cleanup() {
      act(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      const queryCache = queryClient.getQueryCache();
      queryCache.getAll().forEach((query) => query.destroy());
      queryCache.clear();
      const mutationCache = queryClient.getMutationCache();
      mutationCache.getAll().forEach((mutation) => mutation.destroy());
      mutationCache.clear();
    },
    getSetCalls() {
      return setCalls.slice();
    },
  };
}

beforeEach(() => {
  __resetCategoriesActionsStub();
  console.error = () => {};
});

afterEach(() => {
  console.error = originalConsoleError;
});

test("useCategories loads categories for provided spreadsheet", async () => {
  __setCategoriesQueryResponse([
    {
      categoryId: "cat-alpha",
      label: "Alpha",
      color: "#123456",
      description: "first",
      sortOrder: 2,
    },
    {
      categoryId: "cat-bravo",
      label: "Bravo",
      color: "#654321",
      description: "second",
      sortOrder: 1,
    },
  ]);

  const view = await renderUseCategories("sheet-123");

  await view.waitForCondition(
    (latest) => Array.isArray(latest?.query.data) && latest.query.data.length === 2,
    "categories query to resolve",
  );

  const data = view.result.query.data ?? [];
  assert.equal(data.length, 2, "returns normalized drafts");
  assert.equal(data[0].categoryId, "cat-bravo", "sorted ascending by order");
  assert.equal(data[1].categoryId, "cat-alpha", "second item present");
  assert.deepEqual(__getCategoriesCalls(), ["sheet-123"], "fetch called once");

  view.cleanup();
});

test("mutateCategories applies optimistic update and rolls back on error", async () => {
  __setCategoriesQueryResponse([
    {
      categoryId: "cat-alpha",
      label: "Alpha",
      color: "#123456",
      description: "first",
      sortOrder: 1,
    },
    {
      categoryId: "cat-bravo",
      label: "Bravo",
      color: "#654321",
      description: "second",
      sortOrder: 2,
    },
  ]);

  __setCategoriesMutationError(new Error("Save failed"));

  const view = await renderUseCategories("sheet-abc");

  await view.waitForCondition(
    (latest) => Array.isArray(latest?.query.data) && latest.query.data.length === 2,
    "initial categories to load",
  );

  const initial = view.result.query.data?.map((item) => ({ ...item })) ?? [];
  const updatedDrafts = initial.map((item) =>
    item.categoryId === "cat-alpha"
      ? { ...item, label: "Alpha Prime" }
      : item,
  );

  let mutationPromise;
  await act(async () => {
    mutationPromise = view.result.mutation.mutateAsync(updatedDrafts).catch(() => {});
  });

  await view.flush();
  await new Promise((resolve) => setTimeout(resolve, 0));

  await view.waitForCondition(
    () =>
      view
        .getSetCalls()
        .some(
          (call) => Array.isArray(call.value) && call.value[0]?.label === "Alpha Prime",
        ),
    "optimistic cache update",
  );

  const optimisticCall = view
    .getSetCalls()
    .find((call) => Array.isArray(call.value) && call.value[0]?.label === "Alpha Prime");
  assert.ok(optimisticCall, "optimistic setQueryData recorded");

  await mutationPromise;

  await view.waitForCondition(
    (latest) => latest?.mutation.isError === true,
    "mutation to error",
  );

  await view.waitForCondition(
    () =>
      view
        .getSetCalls()
        .some((call) => Array.isArray(call.value) && call.value[0]?.label === "Alpha"),
    "optimistic rollback",
  );

  const finalCall =
    view
      .getSetCalls()
      .findLast?.((call) => Array.isArray(call.value)) ??
    view
      .getSetCalls()
      .slice()
      .reverse()
      .find((call) => Array.isArray(call.value));
  assert.equal(finalCall?.value?.[0]?.label, "Alpha", "rolled back to original data");
  assert.equal(view.result.mutationError, "Save failed", "mutation error surfaced");

  const payloads = __getSaveCategoriesPayloads();
  assert.equal(payloads.length, 1, "save invoked once");
  assert.deepEqual(
    payloads[0],
    {
      spreadsheetId: "sheet-abc",
      categories: [
        {
          categoryId: "cat-alpha",
          label: "Alpha Prime",
          color: "#123456",
          description: "first",
          sortOrder: 1,
        },
        {
          categoryId: "cat-bravo",
          label: "Bravo",
          color: "#654321",
          description: "second",
          sortOrder: 2,
        },
      ],
    },
    "mutation forwards serialized drafts",
  );

  view.cleanup();
});

test("useCategories remains idle when spreadsheet id is null", async () => {
  const view = await renderUseCategories(null);

  await view.flush();

  const data = view.result.query.data ?? [];
  assert.equal(data.length, 0, "no categories when spreadsheet is null");
  assert.equal(view.result.query.fetchStatus, "idle", "query stays idle");
  assert.deepEqual(__getCategoriesCalls(), [], "no fetch invoked");

  view.cleanup();
});

test("mutateCategories forwards deletions to the server action", async () => {
  __setCategoriesQueryResponse([
    {
      categoryId: "cat-alpha",
      label: "Alpha",
      color: "#123456",
      description: "first",
      sortOrder: 1,
    },
    {
      categoryId: "cat-bravo",
      label: "Bravo",
      color: "#654321",
      description: "second",
      sortOrder: 2,
    },
  ]);

  __setCategoriesMutationResponse([
    {
      categoryId: "cat-alpha",
      label: "Alpha",
      color: "#123456",
      description: "first",
      sortOrder: 1,
    },
  ]);

  const view = await renderUseCategories("sheet-delete");

  await view.waitForCondition(
    (latest) => Array.isArray(latest?.query.data) && latest.query.data.length === 2,
    "initial categories to load",
  );

  const initial = view.result.query.data ?? [];
  const trimmed = initial.slice(0, 1);

  await act(async () => {
    await view.result.mutation.mutateAsync(trimmed);
  });

  await view.waitForCondition(
    () =>
      view
        .getSetCalls()
        .some((call) => Array.isArray(call.value) && call.value.length === 1),
    "mutation writes trimmed drafts",
  );

  const payloads = __getSaveCategoriesPayloads();
  assert.equal(payloads.length, 1, "one mutation call recorded");
  assert.equal(payloads[0].categories.length, 1, "deleted row omitted from payload");
  assert.equal(payloads[0].categories[0].categoryId, "cat-alpha", "remaining category persisted");

  const categoriesKey = ["sheet", "sheet-delete", "categories"];

  await view.waitForCondition(
    () => {
      const cache = view.getQueryData(categoriesKey) ?? [];
      return Array.isArray(cache) && cache.length === 1;
    },
    "query reflects trimmed categories",
  );

  view.cleanup();
});
