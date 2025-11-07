// ABOUTME: Verifies the new TanStack Query budget plan hook behavior.
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
  BaseCurrencyProvider,
  __setBaseCurrencyTestValue,
  __resetBaseCurrencyTestValue,
} = stubJiti("./helpers/stubs/base-currency-context");
const {
  __setCategoriesHookData,
  __setCategoriesHookDefault,
  __resetCategoriesHookStub,
} = stubJiti("./helpers/stubs/categories-hook.ts");
const {
  __setBudgetPlanGetResponse,
  __setBudgetPlanGetError,
  __setBudgetPlanSaveError,
  __resetBudgetPlanActionsStub,
  __getBudgetPlanSavePayloads,
} = stubJiti("./helpers/stubs/budget-plan-actions.ts");

const NON_CONCURRENT = { concurrency: false };

process.on("unhandledRejection", (reason) => {
  console.error("[use-budget-plan-test] unhandled rejection", reason);
});

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
    "@/components/currency/base-currency-context": path.resolve(
      __dirname,
      "helpers/stubs/base-currency-context.ts",
    ),
    "@/components/categories/use-categories": path.resolve(
      __dirname,
      "helpers/stubs/categories-hook.ts",
    ),
    "@/app/(authenticated)/actions/budget-plan-actions": path.resolve(
      __dirname,
      "helpers/stubs/budget-plan-actions.ts",
    ),
    "@/lib/debug-log": path.resolve(__dirname, "helpers/stubs/debug-log.ts"),
    "@/lib/query": path.resolve(__dirname, "helpers/stubs/query.ts"),
  };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(check, description, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (check()) {
      return;
    }

    await flushMicrotasks();
  }

  throw new Error(`Timeout waiting for ${description}`);
}

async function renderUseBudgetPlan(initialSpreadsheetId = "sheet-123") {
  const jiti = createTestJiti(__filename, { alias: stubAliases() });
  const { QueryClient, QueryClientProvider } = require("@tanstack/react-query");
  const { useBudgetPlan } = await jiti.import(
    "../src/components/budget-plan/use-budget-plan",
  );

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  let latest;
  let currentId = initialSpreadsheetId;

  function Harness({ spreadsheetId }) {
    latest = useBudgetPlan(spreadsheetId, { isBlocked: false });
    // touch derived data so query subscriptions stay active
    void latest.rows;
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
          React.createElement(
            BaseCurrencyProvider,
            null,
            React.createElement(Harness, { spreadsheetId: currentId }),
          ),
        ),
      );
    });
    await flushMicrotasks();
  }

  await renderWithId(currentId);

  return {
    get manager() {
      return latest;
    },
    async rerender(spreadsheetId) {
      await renderWithId(spreadsheetId);
    },
    async flush() {
      await flushMicrotasks();
    },
    async cleanup() {
      await act(async () => {
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
      await flushMicrotasks();
    },
  };
}

beforeEach(() => {
  console.error = () => {};
  __resetBaseCurrencyTestValue();
  __resetCategoriesHookStub();
  __resetBudgetPlanActionsStub();
  __setCategoriesHookDefault([
    {
      categoryId: "cat-travel",
      label: "Travel",
      color: "#ff0000",
      description: "",
      sortOrder: 1,
    },
  ]);
});

afterEach(() => {
  console.error = originalConsoleError;
});

test("useBudgetPlan loads rows and computes totals", NON_CONCURRENT, async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    convertAmount: (amount, fromCurrency) =>
      fromCurrency === "USD" ? amount : amount * 2,
    formatAmount: (amount, isApproximation) =>
      `${isApproximation ? "~" : "$"}${amount.toFixed(0)}`,
  });

  __setCategoriesHookData("sheet-123", [
    {
      categoryId: "cat-travel",
      label: "Travel",
      color: "#ff0000",
      description: "Trips",
      sortOrder: 1,
    },
  ]);

  __setBudgetPlanGetResponse({
    budgetPlan: [
      {
        recordId: "budget_cat-travel_2024-01",
        categoryId: "cat-travel",
        month: 1,
        year: 2024,
        amount: 500,
        rolloverBalance: 0,
        currency: "USD",
      },
    ],
    metadata: { start: "2024-01-01", months: 12 },
    updatedAt: "2024-01-15T00:00:00.000Z",
  });

  const view = await renderUseBudgetPlan();

  await waitFor(() => view.manager.status === "ready", "manager ready");

  assert.equal(view.manager.status, "ready");
  assert.equal(view.manager.rows.length, 1);
  assert.equal(view.manager.rows[0].cells[0].amount, 500);
  assert.equal(view.manager.grandTotalBaseAmount, 500);
  assert.equal(view.manager.lastSavedAt, "2024-01-15T00:00:00.000Z");

  await view.cleanup();
});

test("useBudgetPlan saves changes optimistically", NON_CONCURRENT, async () => {
  console.log("[use-budget-plan-test] save optimistic start");
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    convertAmount: (amount) => amount,
    formatAmount: (amount) => `$${amount.toFixed(0)}`,
  });

  __setCategoriesHookData("sheet-123", [
    {
      categoryId: "cat-ops",
      label: "Ops",
      color: "#00ff00",
      description: "",
      sortOrder: 1,
    },
  ]);

  __setBudgetPlanGetResponse({
    budgetPlan: [
      {
        recordId: "budget_cat-ops_2024-02",
        categoryId: "cat-ops",
        month: 2,
        year: 2024,
        amount: 200,
        rolloverBalance: 0,
        currency: "USD",
      },
    ],
    metadata: { start: "2024-02-01", months: 12 },
    updatedAt: "2024-02-10T00:00:00.000Z",
  });

  const view = await renderUseBudgetPlan();
  await waitFor(() => view.manager.status === "ready", "manager ready");

  view.manager.setAmount("cat-ops", 0, 350);
  await view.flush();
  assert.equal(view.manager.isDirty, true, "draft flagged dirty after edit");

  await view.manager.save();
  await view.flush();
  await view.flush();
  console.log("[use-budget-plan-test] isSaving after save", view.manager.isSaving);

  const [payload] = __getBudgetPlanSavePayloads();
  assert.equal(payload.spreadsheetId, "sheet-123");
  assert.equal(payload.budgetPlan[0].amount, 350);
  assert.equal(view.manager.isDirty, false);
  assert.equal(typeof view.manager.lastSavedAt, "string");

  await view.cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  console.log("[use-budget-plan-test] save optimistic end");
});

test("useBudgetPlan surfaces save errors and keeps draft dirty", NON_CONCURRENT, async () => {
  console.log("[use-budget-plan-test] save error start");
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    convertAmount: (amount) => amount,
    formatAmount: (amount) => `$${amount.toFixed(0)}`,
  });

  __setBudgetPlanGetResponse({
    budgetPlan: [
      {
        recordId: "budget_cat-exp_2024-03",
        categoryId: "cat-exp",
        month: 3,
        year: 2024,
        amount: 100,
        rolloverBalance: 0,
        currency: "USD",
      },
    ],
    metadata: { start: "2024-03-01", months: 12 },
    updatedAt: "2024-03-05T00:00:00.000Z",
  });

  __setCategoriesHookData("sheet-123", [
    {
      categoryId: "cat-exp",
      label: "Expenses",
      color: "#000",
      description: "",
      sortOrder: 1,
    },
  ]);

  __setBudgetPlanSaveError(new Error("Sheets outage"));

  const view = await renderUseBudgetPlan();
  await waitFor(() => view.manager.status === "ready", "manager ready");

  view.manager.setAmount("cat-exp", 0, 250);
  await view.flush();
  await view.manager.save();
  await view.flush();
  await view.flush();

  await waitFor(() => view.manager.saveError != null, "save error state");
  assert.equal(view.manager.isDirty, false, "draft rolls back after failure");
  assert.match(view.manager.saveError ?? "", /Sheets outage/);

  await view.cleanup();
  console.log("[use-budget-plan-test] save error end");
});

test("useBudgetPlan reports fetch errors", NON_CONCURRENT, async () => {
  console.log("[use-budget-plan-test] fetch error start");
  __setBudgetPlanGetError(new Error("Auth failed"));

  const view = await renderUseBudgetPlan();
  await waitFor(() => view.manager.status === "error", "manager error state");
  assert.match(view.manager.error ?? "", /Auth failed/);

  await view.cleanup();
  console.log("[use-budget-plan-test] fetch error end");
});
