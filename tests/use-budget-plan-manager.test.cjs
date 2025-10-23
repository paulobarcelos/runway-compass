// ABOUTME: Validates the budget plan manager hook behavior end to end.
// ABOUTME: Covers loading, editing, saving, currencies, and health gating.
/* eslint-disable @typescript-eslint/no-require-imports */
require("./helpers/setup-dom.cjs");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const React = require("react");
const { act } = require("react");
const { createRoot } = require("react-dom/client");
const { createTestJiti } = require("./helpers/create-jiti");
const stubJiti = createTestJiti(__filename);
const {
  BaseCurrencyProvider,
  __setBaseCurrencyTestValue,
  __resetBaseCurrencyTestValue,
} = stubJiti("./helpers/stubs/base-currency-context");
const {
  SpreadsheetHealthProvider,
  __setSpreadsheetHealthTestValue,
  __resetSpreadsheetHealthTestValue,
} = stubJiti("./helpers/stubs/spreadsheet-health-context");
const {
  __setManifestRecord,
  __resetManifestRecord,
} = stubJiti("./helpers/stubs/manifest-store");

let originalFetch;

function stubAliases() {
  return {
    "@/components/currency/base-currency-context": path.resolve(
      __dirname,
      "helpers/stubs/base-currency-context.tsx",
    ),
    "@/components/spreadsheet/spreadsheet-health-context": path.resolve(
      __dirname,
      "helpers/stubs/spreadsheet-health-context.tsx",
    ),
    "@/lib/manifest-store": path.resolve(__dirname, "helpers/stubs/manifest-store.ts"),
    "@/lib/manifest-events": path.resolve(__dirname, "helpers/stubs/manifest-events.ts"),
    "@/lib/debug-log": path.resolve(__dirname, "helpers/stubs/debug-log.ts"),
  };
}

async function renderManager(options = {}) {
  const jiti = createTestJiti(__filename, { alias: stubAliases() });
  const { useBudgetPlanManager } = await jiti.import(
    "../src/components/budget-plan/use-budget-plan-manager",
  );

  let latest;

  function TestComponent() {
    latest = useBudgetPlanManager(options);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaseCurrencyProvider,
        null,
        React.createElement(
          SpreadsheetHealthProvider,
          null,
          React.createElement(TestComponent, null),
        ),
      ),
    );
  });

  async function flush() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  await flush();
  await flush();

  return {
    get manager() {
      return latest;
    },
    async flush() {
      await flush();
      await flush();
      return latest;
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

beforeEach(() => {
  originalFetch = global.fetch;
  __resetBaseCurrencyTestValue();
  __resetSpreadsheetHealthTestValue();
  __resetManifestRecord();

  if (global.window?.localStorage?.clear) {
    global.window.localStorage.clear();
  }
  if (!global.window.addEventListener) {
    global.window.addEventListener = () => {};
  }
  if (!global.window.removeEventListener) {
    global.window.removeEventListener = () => {};
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

test("useBudgetPlanManager loads data and computes approximations", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    convertAmount: (amount, fromCurrency) =>
      fromCurrency === "USD" ? amount : amount * 2,
    formatAmount: (amount, isApproximation) =>
      `${isApproximation ? "~" : "$"}${amount.toFixed(2)} USD`,
  });

  __setManifestRecord({ spreadsheetId: "sheet-123", storedAt: 0 });
  __setSpreadsheetHealthTestValue({
    spreadsheetId: "sheet-123",
    status: "ready",
    diagnostics: { warnings: [], errors: [], sheets: [] },
  });

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
              categoryId: "cat-travel",
              label: "Travel",
              color: "#ff0000",
              rolloverFlag: true,
              sortOrder: 1,
              monthlyBudget: 200,
              currencyCode: "EUR",
            },
            {
              categoryId: "cat-supplies",
              label: "Supplies",
              color: "#00ff00",
              rolloverFlag: false,
              sortOrder: 2,
              monthlyBudget: 100,
              currencyCode: "USD",
            },
          ],
        }),
      };
    }

    if (url.startsWith("/api/budget-plan")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          budgetPlan: [
            {
              recordId: "rec-travel-may",
              categoryId: "cat-travel",
              month: 5,
              year: 2024,
              amount: 150,
              rolloverBalance: 0,
            },
            {
              recordId: "rec-travel-jun",
              categoryId: "cat-travel",
              month: 6,
              year: 2024,
              amount: 250,
              rolloverBalance: 0,
            },
            {
              recordId: "rec-supplies-may",
              categoryId: "cat-supplies",
              month: 5,
              year: 2024,
              amount: 90,
              rolloverBalance: 0,
            },
          ],
        }),
      };
    }

    throw new Error(`Unhandled fetch ${url}`);
  };

  const harness = await renderManager({ startDate: new Date("2024-05-01T00:00:00Z") });
  await harness.flush();

  const manager = harness.manager;

  assert.equal(fetchCalls.length, 2);
  assert.equal(manager.status, "ready");
  assert.equal(manager.error, null);
  assert.equal(manager.blockingMessage, null);
  assert.equal(manager.rows.length, 2);

  const travelRow = manager.rows[0];
  assert.equal(travelRow.category.categoryId, "cat-travel");
  assert.equal(travelRow.cells[0].amount, 150);
  assert.equal(travelRow.cells[1].rolloverBalance, 50);
  assert.equal(travelRow.cells[0].baseCurrencyDisplay, "~300.00 USD");

  const suppliesRow = manager.rows[1];
  assert.equal(suppliesRow.category.categoryId, "cat-supplies");
  assert.equal(suppliesRow.cells[0].baseCurrencyDisplay, "$90.00 USD");

  harness.unmount();
});

test("useBudgetPlanManager supports editing and saving the draft grid", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    convertAmount: (amount) => amount,
    formatAmount: (amount) => `$${amount.toFixed(2)} USD`,
  });

  __setManifestRecord({ spreadsheetId: "sheet-789", storedAt: 0 });
  __setSpreadsheetHealthTestValue({
    spreadsheetId: "sheet-789",
    status: "ready",
    diagnostics: { warnings: [], errors: [], sheets: [] },
  });

  const responses = {
    categories: {
      ok: true,
      status: 200,
      json: async () => ({
        categories: [
          {
            categoryId: "cat-ops",
            label: "Operations",
            color: "#123456",
            rolloverFlag: true,
            sortOrder: 1,
            monthlyBudget: 300,
            currencyCode: "USD",
          },
        ],
      }),
    },
    loadPlan: {
      ok: true,
      status: 200,
      json: async () => ({
        budgetPlan: [
          {
            recordId: "rec-ops-may",
            categoryId: "cat-ops",
            month: 5,
            year: 2024,
            amount: 250,
            rolloverBalance: 0,
          },
        ],
      }),
    },
  };

  const postCalls = [];

  global.fetch = async (url, options = {}) => {
    if (url.startsWith("/api/categories")) {
      return responses.categories;
    }

    if (url.startsWith("/api/budget-plan") && options.method !== "POST") {
      return responses.loadPlan;
    }

    if (url.startsWith("/api/budget-plan") && options.method === "POST") {
      postCalls.push(JSON.parse(options.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          budgetPlan: postCalls[postCalls.length - 1].budgetPlan,
        }),
      };
    }

    throw new Error(`Unhandled fetch ${url}`);
  };

  const harness = await renderManager({ startDate: new Date("2024-05-01T00:00:00Z") });
  await harness.flush();

  let manager = harness.manager;

  assert.equal(manager.isDirty, false);
  assert.equal(manager.rows[0].cells[0].rolloverBalance, 0);

  await act(async () => {
    manager.setAmount("cat-ops", 0, 100);
  });

  await harness.flush();
  manager = harness.manager;

  assert.equal(manager.isDirty, true);
  assert.equal(manager.rows[0].cells[0].amount, 100);
  assert.equal(manager.rows[0].cells[1].rolloverBalance > 0, true);

  await act(async () => {
    await manager.save();
  });

  await harness.flush();
  manager = harness.manager;

  assert.equal(postCalls.length, 1);
  assert.equal(manager.isDirty, false);
  assert.equal(manager.isSaving, false);

  harness.unmount();
});

test("useBudgetPlanManager respects spreadsheet health blocking", async () => {
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    convertAmount: (amount) => amount,
    formatAmount: (amount) => `$${amount.toFixed(2)} USD`,
  });

  __setManifestRecord({ spreadsheetId: "sheet-blocked", storedAt: 0 });
  __setSpreadsheetHealthTestValue({
    spreadsheetId: "sheet-blocked",
    status: "ready",
    diagnostics: {
      warnings: [],
      errors: [
        {
          sheetId: "budget_plan",
          message: "Headers missing",
        },
      ],
      sheets: [],
    },
  });

  const fetchCalls = [];
  global.fetch = async (...args) => {
    fetchCalls.push(args);
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    };
  };

  const harness = await renderManager({ startDate: new Date("2024-05-01T00:00:00Z") });
  await harness.flush();

  const manager = harness.manager;

  assert.equal(fetchCalls.length, 0);
  assert.equal(manager.status, "blocked");
  assert.equal(manager.blockingMessage?.includes("budget"), true);
  assert.equal(manager.rows.length, 0);

  harness.unmount();
});
