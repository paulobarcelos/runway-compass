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

let latestMetadata = null;
let renderRoot = null;

function renderHook(props) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  renderRoot = createRoot(container);

  function TestComponent(componentProps) {
    const { useCashPlannerMetadata } = require("../src/components/cash-planner/use-cash-planner-metadata");
    latestMetadata = useCashPlannerMetadata(componentProps);
    return null;
  }

  act(() => {
    renderRoot.render(React.createElement(TestComponent, props));
  });

  return {
    async flush() {
      await act(async () => {
        await Promise.resolve();
      });
    },
    unmount() {
      act(() => {
        renderRoot.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

const originalFetch = global.fetch;

beforeEach(() => {
  latestMetadata = null;
  renderRoot = null;
});

afterEach(() => {
  global.fetch = originalFetch;
  if (renderRoot) {
    act(() => {
      renderRoot.unmount();
    });
  }
});

test("useCashPlannerMetadata loads metadata, options, and orphans", async () => {
  const fetchCalls = [];

  global.fetch = async (url) => {
    fetchCalls.push(url);

    if (url.startsWith("/api/categories")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          categories: [
            {
              categoryId: "cat-income",
              label: "Consulting",
              color: "#00ff99",
              flowType: "income",
              rolloverFlag: false,
              sortOrder: 5,
              monthlyBudget: 0,
              currencyCode: "USD",
            },
            {
              categoryId: "cat-expense",
              label: "Rent",
              color: "#ff2255",
              flowType: "expense",
              rolloverFlag: false,
              sortOrder: 10,
              monthlyBudget: 0,
              currencyCode: "USD",
            },
          ],
        }),
      };
    }

    if (url.startsWith("/api/accounts")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accounts: [
            {
              accountId: "acct-1",
              name: "Operating",
              type: "checking",
              currency: "usd",
              includeInRunway: true,
              sortOrder: 1,
              lastSnapshotAt: "",
            },
          ],
        }),
      };
    }

    throw new Error(`Unhandled fetch ${url}`);
  };

  const harness = renderHook({
    spreadsheetId: "sheet-123",
    entries: [
      {
        flowId: "flow-1",
        accountId: "acct-1",
        categoryId: "cat-income",
      },
      {
        flowId: "flow-orphan-account",
        accountId: "acct-missing",
        categoryId: "cat-income",
      },
      {
        flowId: "flow-orphan-category",
        accountId: "acct-1",
        categoryId: "cat-missing",
      },
    ],
  });
  await harness.flush();
  await harness.flush();

  assert.ok(latestMetadata, "metadata should be captured");
  assert.equal(latestMetadata.status, "ready");
  assert.equal(latestMetadata.categories.length, 2);
  assert.equal(latestMetadata.accounts.length, 1);
  assert.deepEqual(latestMetadata.categoryOptions, [
    { id: "cat-income", label: "Consulting" },
    { id: "cat-expense", label: "Rent" },
  ]);
  assert.deepEqual(latestMetadata.accountOptions, [
    { id: "acct-1", name: "Operating", currency: "USD" },
  ]);
  assert.deepEqual(fetchCalls.sort(), [
    "/api/accounts?spreadsheetId=sheet-123",
    "/api/categories?spreadsheetId=sheet-123",
  ]);
  assert.equal(latestMetadata.categoriesById.get("cat-income").flowType, "income");
  assert.deepEqual(latestMetadata.incomeCategoryIds, ["cat-income"]);
  assert.deepEqual(latestMetadata.expenseCategoryIds, ["cat-expense"]);
  assert.equal(latestMetadata.accountDisplayById.get("acct-1"), "Operating (USD)");
  assert.deepEqual(latestMetadata.orphanAccountIds, ["acct-missing"]);
  assert.deepEqual(latestMetadata.orphanCategoryIds, ["cat-missing"]);
  assert.equal(latestMetadata.orphanEntryLookup.size, 2);
  assert.deepEqual(latestMetadata.orphanEntryLookup.get("flow-orphan-account"), {
    account: true,
    category: false,
  });
  assert.deepEqual(latestMetadata.orphanEntryLookup.get("flow-orphan-category"), {
    account: false,
    category: true,
  });

  harness.unmount();
});

test("useCashPlannerMetadata blocks when disabled", async () => {
  const harness = renderHook({
    spreadsheetId: "sheet-123",
    disabled: true,
    disabledMessage: "Blocked by health",
  });
  await harness.flush();

  assert.ok(latestMetadata);
  assert.equal(latestMetadata.status, "blocked");
  assert.equal(latestMetadata.blockingMessage, "Blocked by health");
  assert.equal(latestMetadata.categories.length, 0);
  assert.equal(latestMetadata.accounts.length, 0);

  harness.unmount();
});
