// ABOUTME: Exercises the budget plan grid UI rendering logic.
// ABOUTME: Confirms loading, blocking, and currency display behaviors.
/* eslint-disable @typescript-eslint/no-require-imports */
require("./helpers/setup-dom.cjs");
const { test } = require("node:test");
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
  __resetBaseCurrencyTestValue,
} = stubJiti("./helpers/stubs/base-currency-context");

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

async function loadGridComponent() {
  return require("../src/components/budget-plan/budget-plan-grid");
}

function renderWithProvider(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(BaseCurrencyProvider, null, element));
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

function setInputValue(input, value) {
  const prototype = Object.getPrototypeOf(input);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }
}

test("BudgetPlanGrid shows loading indicator", async () => {
  __resetBaseCurrencyTestValue();
  const { BudgetPlanGrid } = await loadGridComponent();

  const manager = {
    status: "loading",
    blockingMessage: null,
    error: null,
    isSaving: false,
    isDirty: false,
    months: [],
    rows: [],
    lastSavedAt: null,
    save: async () => {},
    reset: () => {},
    setAmount: () => {},
  };

  const { container, unmount } = renderWithProvider(
    React.createElement(BudgetPlanGrid, { manager }),
  );

  assert.match(container.textContent ?? "", /Loading budget plan/i);
  unmount();
});

test("BudgetPlanGrid renders blocking message when health fails", async () => {
  __resetBaseCurrencyTestValue();
  const { BudgetPlanGrid } = await loadGridComponent();

  const manager = {
    status: "blocked",
    blockingMessage: "Spreadsheet issues detected",
    error: null,
    isSaving: false,
    isDirty: false,
    months: [],
    rows: [],
    lastSavedAt: null,
    save: async () => {},
    reset: () => {},
    setAmount: () => {},
  };

  const { container, unmount } = renderWithProvider(
    React.createElement(BudgetPlanGrid, { manager }),
  );

  assert.match(container.textContent ?? "", /Spreadsheet issues detected/);
  unmount();
});

test("BudgetPlanGrid displays amounts, approximations, and rollovers", async () => {
  __resetBaseCurrencyTestValue();
  const { BudgetPlanGrid } = await loadGridComponent();

  const savedCalls = [];
  const resetCalls = [];
  const amountCalls = [];

  const manager = {
    status: "ready",
    blockingMessage: null,
    error: null,
    isSaving: false,
    isDirty: true,
    months: [
      { id: "2024-05", month: 5, year: 2024, index: 0 },
      { id: "2024-06", month: 6, year: 2024, index: 1 },
    ],
    rows: [
      {
        category: {
          categoryId: "cat-travel",
          label: "Travel",
          color: "#ff0000",
          rolloverFlag: true,
          currencyCode: "EUR",
        },
        cells: [
          {
            monthIndex: 0,
            amount: 150,
            baseCurrencyDisplay: "~300.00 USD",
            rolloverBalance: 0,
            isGenerated: false,
          },
          {
            monthIndex: 1,
            amount: 180,
            baseCurrencyDisplay: "~360.00 USD",
            rolloverBalance: 50,
            isGenerated: false,
          },
        ],
      },
    ],
    lastSavedAt: "2024-05-01T00:00:00.000Z",
    save: async () => {
      savedCalls.push(true);
    },
    reset: () => {
      resetCalls.push(true);
    },
    setAmount: (categoryId, monthIndex, value) => {
      amountCalls.push({ categoryId, monthIndex, value });
    },
  };

  const { container, unmount } = renderWithProvider(
    React.createElement(BudgetPlanGrid, { manager }),
  );

  const amountInput = /** @type {HTMLInputElement | null} */ (
    container.querySelector('[data-cell="cat-travel:0"]')
  );
  assert.ok(amountInput, "amount input found");
  await act(async () => {
    setInputValue(amountInput, "200");
    amountInput.dispatchEvent(new window.Event("input", { bubbles: true }));
    amountInput.dispatchEvent(new window.Event("change", { bubbles: true }));
    await Promise.resolve();
  });

  assert.deepEqual(amountCalls, [
    { categoryId: "cat-travel", monthIndex: 0, value: 200 },
  ]);

  const textContent = container.textContent ?? "";
  assert.match(textContent, /~300\.00 USD/);
  assert.match(textContent, /Rollover:\s*50/);

  const saveButton = container.querySelector('[data-action="save"]');
  assert.ok(saveButton, "save button found");
  await act(async () => {
    saveButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

  assert.equal(savedCalls.length, 1);

  const resetButton = container.querySelector('[data-action="reset"]');
  assert.ok(resetButton, "reset button found");
  await act(async () => {
    resetButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(resetCalls.length, 1);
  unmount();
});
