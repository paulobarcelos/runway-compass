// ABOUTME: Validates core rendering behavior of CashPlannerLedger.
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

Module._load = function patchedLoad(request, parent, isMain) {
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
  __setBaseCurrencyTestValue,
  __resetBaseCurrencyTestValue,
} = require("./helpers/stubs/base-currency-context.tsx");

async function renderLedger(props) {
  const { CashPlannerLedger } = require("../src/components/cash-planner/cash-planner-ledger");

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(
        BaseCurrencyProvider,
        null,
        React.createElement(CashPlannerLedger, props),
      ),
    );
  });

  return {
    container,
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

function changeTextInput(element, value) {
  const prototype = Object.getPrototypeOf(element);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new element.ownerDocument.defaultView.Event("input", { bubbles: true }));
}

test("CashPlannerLedger renders rows and base currency", async () => {
  __resetBaseCurrencyTestValue();
  __setBaseCurrencyTestValue({
    formatAmountWithBase: () => ({
      formattedAmount: "$1,200.00",
      baseAmount: 1200,
      formattedBaseAmount: "$1,200.00",
    }),
  });

  const ledger = await renderLedger({
    entries: [
      {
        flowId: "flow-1",
        date: "2025-04-01",
        amount: 1200,
        status: "planned",
        accountId: "acct-1",
        categoryId: "cat-1",
        note: "Invoice",
      },
    ],
    accounts: [{ id: "acct-1", name: "Operating", currency: "USD" }],
    categories: [{ id: "cat-1", label: "Consulting" }],
    orphanInfo: new Map(),
    onCreate: async () => null,
    onUpdate: async () => null,
    onDelete: async () => {},
    isSaving: false,
  });

  const text = ledger.container.textContent ?? "";
  assert.match(text, /Consulting/);
  assert.match(text, /Operating/);

  const rows = ledger.container.querySelectorAll("tbody tr");
  const entryRow = rows[1];
  assert.ok(entryRow, "expected existing entry row to render");

  const basePreview = entryRow.querySelector("[data-testid='money-input-base-preview']");
  assert.equal(basePreview, null, "base preview hidden when entry matches base currency");

  const dateInput = ledger.container.querySelector('tbody tr input[type="date"]');
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(dateInput?.value, today);

  ledger.unmount();
});

test("CashPlannerLedger delete button invokes handler", async () => {
  __resetBaseCurrencyTestValue();

  const deleteCalls = [];

  const ledger = await renderLedger({
    entries: [
      {
        flowId: "flow-1",
        date: "2025-04-01",
        amount: -75,
        status: "planned",
        accountId: "acct-1",
        categoryId: "cat-1",
        note: "Snacks",
      },
    ],
    accounts: [{ id: "acct-1", name: "Operating", currency: "USD" }],
    categories: [{ id: "cat-1", label: "Office" }],
    orphanInfo: new Map(),
    onCreate: async () => null,
    onUpdate: async () => null,
    onDelete: async (flowId) => {
      deleteCalls.push(flowId);
    },
    isSaving: false,
  });

  const buttons = ledger.container.querySelectorAll('button[type="button"]');
  const deleteButton = buttons[buttons.length - 1];
  assert.ok(deleteButton);

  await act(async () => {
    deleteButton.click();
  });

  assert.deepEqual(deleteCalls, ["flow-1"]);
  ledger.unmount();
});

test("CashPlannerLedger highlights orphaned metadata", async () => {
  __resetBaseCurrencyTestValue();

  const orphanInfo = new Map([
    ["flow-2", { account: true, category: false }],
  ]);

  const ledger = await renderLedger({
    entries: [
      {
        flowId: "flow-2",
        date: "2025-04-03",
        amount: 310,
        status: "planned",
        accountId: "acct-missing",
        categoryId: "cat-1",
        note: "Subscription",
      },
    ],
    accounts: [{ id: "acct-1", name: "Operating", currency: "USD" }],
    categories: [{ id: "cat-1", label: "Office" }],
    orphanInfo,
    onCreate: async () => null,
    onUpdate: async () => null,
    onDelete: async () => {},
    isSaving: false,
  });

  const rows = ledger.container.querySelectorAll("tbody tr");
  assert.equal(rows.length, 2);
  const text = rows[1].textContent ?? "";
  assert.match(text, /Metadata missing/);
  assert.match(text, /Account removed/);
  ledger.unmount();
});

test("CashPlannerLedger propagates dropdown updates", async () => {
  __resetBaseCurrencyTestValue();

  const updateCalls = [];
  const baseEntry = {
    flowId: "flow-1",
    date: "2025-04-01",
    amount: 500,
    status: "planned",
    accountId: "acct-1",
    categoryId: "cat-1",
    note: "Paycheck",
  };

  const ledger = await renderLedger({
    entries: [baseEntry],
    accounts: [
      { id: "acct-1", name: "Operating", currency: "USD" },
      { id: "acct-2", name: "Savings", currency: "USD" },
    ],
    categories: [
      { id: "cat-1", label: "Income" },
      { id: "cat-2", label: "Other" },
    ],
    orphanInfo: new Map(),
    onCreate: async () => null,
    onUpdate: async (flowId, updates) => {
      updateCalls.push({ flowId, updates });
      return { ...baseEntry, ...updates };
    },
    onDelete: async () => {},
    isSaving: false,
  });

  const rows = ledger.container.querySelectorAll("tbody tr");
  const entryRow = rows[1];
  const statusSelect = entryRow.querySelector("select[data-testid='ledger-status']");
  assert.ok(statusSelect, "status select should be present");
  await act(async () => {
    statusSelect.value = "posted";
    statusSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  const accountSelect = entryRow.querySelector("select[data-testid='ledger-account']");
  assert.ok(accountSelect, "account select should be present");
  await act(async () => {
    accountSelect.value = "acct-2";
    accountSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

  assert.deepEqual(updateCalls, [
    { flowId: "flow-1", updates: { status: "posted" } },
    { flowId: "flow-1", updates: { accountId: "acct-2" } },
  ]);

  ledger.unmount();
});

test("CashPlannerLedger saves amount edits via MoneyInput", async () => {
  __resetBaseCurrencyTestValue();

  const updateCalls = [];
  const baseEntry = {
    flowId: "flow-1",
    date: "2025-04-01",
    amount: 500,
    status: "planned",
    accountId: "acct-1",
    categoryId: "cat-1",
    note: "Paycheck",
  };

  const ledger = await renderLedger({
    entries: [baseEntry],
    accounts: [{ id: "acct-1", name: "Operating", currency: "USD" }],
    categories: [{ id: "cat-1", label: "Income" }],
    orphanInfo: new Map(),
    onCreate: async () => null,
    onUpdate: async (flowId, updates) => {
      updateCalls.push({ flowId, updates });
      return { ...baseEntry, ...updates };
    },
    onDelete: async () => {},
    isSaving: false,
  });

  const rows = ledger.container.querySelectorAll("tbody tr");
  const entryRow = rows[1];
  const amountInput = entryRow.querySelector("input[type='text']");
  assert.ok(amountInput, "amount input should render");

  await act(async () => {
    amountInput.focus();
  });

  await act(async () => {
    changeTextInput(amountInput, "612.45");
  });

  await act(async () => {
    amountInput.blur();
    await Promise.resolve();
  });

  assert.deepEqual(updateCalls, [{ flowId: "flow-1", updates: { amount: 612.45 } }]);

  ledger.unmount();
});

test("CashPlannerLedger shows base preview for non-base currency", async () => {
  __resetBaseCurrencyTestValue();
  __setBaseCurrencyTestValue({
    baseCurrency: "USD",
    formatAmountWithBase: () => ({
      formattedAmount: "€200.00",
      baseAmount: 210,
      formattedBaseAmount: "$210.00",
    }),
  });

  const ledger = await renderLedger({
    entries: [
      {
        flowId: "flow-1",
        date: "2025-05-01",
        amount: 200,
        status: "planned",
        accountId: "acct-1",
        categoryId: "cat-1",
        note: "Contract",
      },
    ],
    accounts: [{ id: "acct-1", name: "Consulting", currency: "EUR" }],
    categories: [{ id: "cat-1", label: "Revenue" }],
    orphanInfo: new Map(),
    onCreate: async () => null,
    onUpdate: async () => null,
    onDelete: async () => {},
    isSaving: false,
  });

  const preview = ledger.container.querySelector("[data-testid='money-input-base-preview']");
  assert.ok(preview, "expected base preview to render for non-base currency");
  assert.equal(preview.textContent, "~$210.00");

  ledger.unmount();
});
