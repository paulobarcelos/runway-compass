// ABOUTME: Exercises the budget plan grid UI rendering logic.
// ABOUTME: Confirms horizon controls, helper actions, and totals rendering.
/* eslint-disable @typescript-eslint/no-require-imports */
require("./helpers/setup-dom.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const React = require("react");
const ReactTestUtils = require("react-dom/test-utils");
const { act } = ReactTestUtils;
const { createRoot } = require("react-dom/client");
const tsnode = require("ts-node");
const tsconfigPaths = require("tsconfig-paths");
const tsconfig = require("../tsconfig.json");
const { createTestJiti } = require("./helpers/create-jiti");
const stubJiti = createTestJiti(__filename);
const stubBaseCurrency = stubJiti("./helpers/stubs/base-currency-context");
const { BaseCurrencyProvider, __resetBaseCurrencyTestValue } = stubBaseCurrency;

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
  const modulePath = path.resolve(
    __dirname,
    "../src/components/currency/base-currency-context.tsx",
  );

  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: stubBaseCurrency,
  };

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

function queryMoneyInput(container, cellId) {
  return container.querySelector(`div[data-cell="${cellId}"] input[type="text"]`);
}

function invokeReactOnChange(element, value) {
  const propKey = Object.getOwnPropertyNames(element).find((key) =>
    key.startsWith("__reactProps$"),
  );

  if (!propKey) {
    throw new Error("React props key not found for element");
  }

  const props = element[propKey];

  if (typeof props.onChange === "function") {
    props.onChange({ target: { value } });
  }
}

test("BudgetPlanGrid shows loading indicator", async () => {
  __resetBaseCurrencyTestValue();
  const { BudgetPlanGrid } = await loadGridComponent();

  const manager = {
    status: "loading",
    blockingMessage: null,
    error: null,
    saveError: null,
    isSaving: false,
    isDirty: false,
    isHorizonUpdating: false,
    horizonError: null,
    metadata: null,
    months: [],
    rows: [],
    grandTotalBaseAmount: 0,
    grandTotalBaseDisplay: "$0.00 USD",
    lastSavedAt: null,
    updateHorizon: async () => {},
    copyPreviousMonth: () => {},
    fillRemainingMonths: () => {},
    fillAllMonths: () => {},
    spreadEvenly: () => {},
    setCellValue: () => {},
    setAmount: () => {},
    reset: () => {},
    save: async () => {},
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
    saveError: null,
    isSaving: false,
    isDirty: false,
    isHorizonUpdating: false,
    horizonError: null,
    metadata: null,
    months: [],
    rows: [],
    grandTotalBaseAmount: 0,
    grandTotalBaseDisplay: "$0.00 USD",
    lastSavedAt: null,
    updateHorizon: async () => {},
    copyPreviousMonth: () => {},
    fillRemainingMonths: () => {},
    fillAllMonths: () => {},
    spreadEvenly: () => {},
    setCellValue: () => {},
    setAmount: () => {},
    reset: () => {},
    save: async () => {},
  };

  const { container, unmount } = renderWithProvider(
    React.createElement(BudgetPlanGrid, { manager }),
  );

  assert.match(container.textContent ?? "", /Spreadsheet issues detected/);
  unmount();
});

test("BudgetPlanGrid displays helpers, totals, and triggers edits", async () => {
  __resetBaseCurrencyTestValue();
  const { BudgetPlanGrid } = await loadGridComponent();

  const setCellCalls = [];
  const copyCalls = [];
  const fillRemainingCalls = [];
  const fillAllCalls = [];
  const spreadCalls = [];
  const resetCalls = [];
  const saveCalls = [];

  const manager = {
    status: "ready",
    blockingMessage: null,
    error: null,
    saveError: null,
    isSaving: false,
    isDirty: true,
    isHorizonUpdating: false,
    horizonError: null,
    metadata: { start: "2024-05-01", months: 2 },
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
          flowType: "expense",
          rolloverFlag: true,
          currencyCode: "EUR",
        },
        cells: [
          {
            recordId: "rec-travel-may",
            monthIndex: 0,
            month: 5,
            year: 2024,
            amount: 150,
            rolloverBalance: 0,
            currency: "EUR",
            baseCurrencyDisplay: "~300.00 USD",
            isGenerated: false,
          },
          {
            recordId: "rec-travel-jun",
            monthIndex: 1,
            month: 6,
            year: 2024,
            amount: 180,
            rolloverBalance: 30,
            currency: "EUR",
            baseCurrencyDisplay: "~360.00 USD",
            isGenerated: false,
          },
        ],
        totalBaseAmount: 660,
        totalBaseDisplay: "$660.00 USD",
      },
    ],
    grandTotalBaseAmount: 660,
    grandTotalBaseDisplay: "$660.00 USD",
    lastSavedAt: "2024-05-01T12:00:00.000Z",
    updateHorizon: async () => {},
    copyPreviousMonth: (...args) => copyCalls.push(args),
    fillRemainingMonths: (...args) => fillRemainingCalls.push(args),
    fillAllMonths: (...args) => fillAllCalls.push(args),
    spreadEvenly: (...args) => spreadCalls.push(args),
    setCellValue: (...args) => setCellCalls.push(args),
    setAmount: () => {},
    reset: () => {
      resetCalls.push(true);
    },
    save: async () => {
      saveCalls.push(true);
    },
  };

  const { container, unmount } = renderWithProvider(
    React.createElement(BudgetPlanGrid, { manager }),
  );

  const moneyInput = queryMoneyInput(container, "cat-travel:0");
  assert.ok(moneyInput, "money input located");

  await act(async () => {
    invokeReactOnChange(moneyInput, "200");
  });

  assert.deepEqual(setCellCalls.pop(), ["cat-travel", 0, { amount: 200, currency: "EUR" }]);

  const helperButtons = container.querySelectorAll('div[data-cell="cat-travel:0"] button');
  const secondCellButtons = container.querySelectorAll('div[data-cell="cat-travel:1"] button');
  assert.equal(helperButtons.length, 4);

  await act(async () => {
    secondCellButtons[0].click();
    helperButtons[1].click();
    helperButtons[2].click();
    helperButtons[3].click();
  });

  assert.deepEqual(copyCalls.pop(), ["cat-travel", 1]);
  assert.deepEqual(fillRemainingCalls.pop(), ["cat-travel", 0]);
  assert.deepEqual(fillAllCalls.pop(), ["cat-travel", 0]);
  assert.deepEqual(spreadCalls.pop(), ["cat-travel", 0]);

  const categoryHeader = container.querySelector('th[data-column="category"]');
  const totalHeader = container.querySelector('th[data-column="total"]');
  const categoryCell = container.querySelector('th[data-column="category"]');
  const totalCell = container.querySelector('td[data-column="total"]');

  assert.ok(categoryHeader?.className.includes("sticky left-0"));
  assert.ok(totalHeader?.className.includes("sticky right-0"));
  assert.ok(categoryCell?.className.includes("sticky left-0"));
  assert.ok(totalCell?.className.includes("sticky right-0"));

  const totalsText = container.textContent ?? "";
  assert.match(totalsText, /Grand total/i);
  assert.match(totalsText, /\$660\.00 USD/);

  const resetButton = container.querySelector('button[data-action="reset"]');
  const saveButton = container.querySelector('button[data-action="save"]');

  await act(async () => {
    resetButton.click();
    saveButton.click();
  });

  assert.equal(resetCalls.length, 1);
  assert.equal(saveCalls.length, 1);

  unmount();
});

test("BudgetPlanGrid horizon controls apply updates", async () => {
  __resetBaseCurrencyTestValue();
  const { BudgetPlanGrid } = await loadGridComponent();

  const updateCalls = [];

  const manager = {
    status: "ready",
    blockingMessage: null,
    error: null,
    saveError: null,
    isSaving: false,
    isDirty: false,
    isHorizonUpdating: false,
    horizonError: null,
    metadata: { start: "2024-05-01", months: 12 },
    months: [{ id: "2024-05", month: 5, year: 2024, index: 0 }],
    rows: [
      {
        category: {
          categoryId: "cat-travel",
          label: "Travel",
          color: "#ff0000",
          flowType: "expense",
          rolloverFlag: false,
          currencyCode: "USD",
        },
        cells: [
          {
            recordId: "rec",
            monthIndex: 0,
            month: 5,
            year: 2024,
            amount: 100,
            rolloverBalance: 0,
            currency: "USD",
            baseCurrencyDisplay: "$100.00 USD",
            isGenerated: false,
          },
        ],
        totalBaseAmount: 100,
        totalBaseDisplay: "$100.00 USD",
      },
    ],
    grandTotalBaseAmount: 100,
    grandTotalBaseDisplay: "$100.00 USD",
    lastSavedAt: null,
    updateHorizon: async (meta, action) => {
      updateCalls.push({ meta, action });
    },
    copyPreviousMonth: () => {},
    fillRemainingMonths: () => {},
    fillAllMonths: () => {},
    spreadEvenly: () => {},
    setCellValue: () => {},
    setAmount: () => {},
    reset: () => {},
    save: async () => {},
  };

  const { container, unmount } = renderWithProvider(
    React.createElement(BudgetPlanGrid, { manager }),
  );

  const durationInput = container.querySelector('input[type="number"]');
  assert.ok(durationInput);

  await act(async () => {
    invokeReactOnChange(durationInput, "18");
  });

  const applyButton = Array.from(container.querySelectorAll("button")).find((button) =>
    /Apply horizon/.test(button.textContent ?? ""),
  );
  assert.ok(applyButton);

  await act(async () => {
    applyButton.click();
    await Promise.resolve();
  });

  assert.deepEqual(updateCalls.pop(), {
    meta: { start: "2024-05-01", months: 18 },
    action: "expand",
  });

  unmount();
});
