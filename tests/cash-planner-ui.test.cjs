// ABOUTME: Smoke-tests the CashPlannerManager component with stubbed hooks.
/* eslint-disable @typescript-eslint/no-require-imports */
require("./helpers/setup-dom.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const React = require("react");
const { act } = require("react");
const { createRoot } = require("react-dom/client");
const tsnode = require("ts-node");
const tsconfigPaths = require("tsconfig-paths");
const tsconfig = require("../tsconfig.json");

const Module = require("module");
const originalLoad = Module._load;

const managerStateReady = {
  status: "ready",
  blockingMessage: null,
  error: null,
  entries: [
    {
      flowId: "flow-1",
      date: "2025-06-01",
      amount: 500,
      status: "planned",
      accountId: "acct-1",
      categoryId: "cat-1",
      note: "Consulting",
    },
  ],
  isSaving: false,
  reload: async () => {},
  createEntry: async () => null,
  updateEntry: async () => null,
  deleteEntry: async () => {},
};

const metadataStateReady = {
  status: "ready",
  blockingMessage: null,
  error: null,
  categories: [
    {
      categoryId: "cat-1",
      label: "Consulting",
      color: "#fff",
      flowType: "income",
      rolloverFlag: false,
      sortOrder: 1,
      monthlyBudget: 0,
      currencyCode: "USD",
    },
  ],
  accounts: [
    {
      accountId: "acct-1",
      name: "Operating",
      type: "checking",
      currency: "USD",
      includeInRunway: true,
      sortOrder: 1,
      lastSnapshotAt: null,
    },
  ],
  categoriesById: new Map(),
  accountsById: new Map(),
  incomeCategoryIds: [],
  expenseCategoryIds: [],
  categoryLabelsById: new Map(),
  accountDisplayById: new Map(),
  categoryOptions: [{ id: "cat-1", label: "Consulting" }],
  accountOptions: [{ id: "acct-1", name: "Operating", currency: "USD" }],
  orphanAccountIds: [],
  orphanCategoryIds: [],
  orphanEntryLookup: new Map(),
  reload: async () => {},
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (request.includes("use-cash-planner-manager")) {
    return {
      useCashPlannerManager: () => managerStateReady,
    };
  }

  if (request.includes("use-cash-planner-metadata")) {
    return {
      useCashPlannerMetadata: () => metadataStateReady,
    };
  }

  if (request === "@/components/spreadsheet/spreadsheet-health-context") {
    return {
      useSpreadsheetHealth: () => ({ spreadsheetId: "sheet-123", diagnostics: {} }),
    };
  }

  if (request === "@/components/spreadsheet/spreadsheet-health-helpers") {
    return {
      buildSheetUrl: () => "https://example.com/sheet",
      filterSheetIssues: () => ({ sheetTitle: "Ledger", sheetGid: "0", hasErrors: false, warnings: [] }),
    };
  }

  if (request === "@/components/currency/base-currency-context") {
    return require("./helpers/stubs/base-currency-context.tsx");
  }

  return originalLoad(request, parent, isMain);
};

process.on("exit", () => {
  Module._load = originalLoad;
});

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

const {
  BaseCurrencyProvider,
  __resetBaseCurrencyTestValue,
} = require("./helpers/stubs/base-currency-context.tsx");

test("CashPlannerManager renders ledger table", async () => {
  __resetBaseCurrencyTestValue();
  managerStateReady.status = "ready";
  managerStateReady.entries = [
    {
      flowId: "flow-1",
      date: "2025-06-01",
      amount: 500,
      status: "planned",
      accountId: "acct-1",
      categoryId: "cat-1",
      note: "Consulting",
    },
  ];

  const { CashPlannerManager } = require("../src/components/cash-planner/cash-planner-manager");

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(BaseCurrencyProvider, null, React.createElement(CashPlannerManager)),
    );
  });

  const text = container.textContent ?? "";
  assert.match(text, /Ledger/);
  assert.match(text, /Consulting/);
  assert.match(text, /Operating/);

  act(() => {
    root.unmount();
  });
  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }

  delete require.cache[require.resolve("../src/components/cash-planner/cash-planner-manager")];
});

test("CashPlannerManager shows loading state", async () => {
  __resetBaseCurrencyTestValue();
  managerStateReady.status = "loading";
  managerStateReady.entries = [];

  const { CashPlannerManager } = require("../src/components/cash-planner/cash-planner-manager");

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(BaseCurrencyProvider, null, React.createElement(CashPlannerManager)),
    );
  });

  const text = container.textContent ?? "";
  assert.match(text, /Loading ledger entries…/);

  act(() => {
    root.unmount();
  });
  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }

  delete require.cache[require.resolve("../src/components/cash-planner/cash-planner-manager")];
  managerStateReady.status = "ready";
});
