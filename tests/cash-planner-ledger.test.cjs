// ABOUTME: Ensures cash planner ledger renders states and wires actions.
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

async function loadComponent() {
  return require("../src/components/cash-planner/cash-planner-ledger");
}

function renderComponent(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(element);
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

test("CashPlannerLedger shows loading state", async () => {
  const { CashPlannerLedger } = await loadComponent();

  const manager = {
    status: "loading",
    blockingMessage: null,
    error: null,
    flows: [],
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    reload: async () => {},
    save: async () => {},
    addFlow: () => {},
    updateFlow: () => {},
    removeFlow: () => {},
    duplicateFlow: () => {},
  };

  const { container, unmount } = renderComponent(
    React.createElement(CashPlannerLedger, { manager }),
  );

  assert.match(container.textContent ?? "", /Loading cash planner/i);
  unmount();
});

test("CashPlannerLedger renders blocking state", async () => {
  const { CashPlannerLedger } = await loadComponent();

  const manager = {
    status: "blocked",
    blockingMessage: "Connect a sheet",
    error: null,
    flows: [],
    isDirty: false,
    isSaving: false,
    lastSavedAt: null,
    reload: async () => {},
    save: async () => {},
    addFlow: () => {},
    updateFlow: () => {},
    removeFlow: () => {},
    duplicateFlow: () => {},
  };

  const { container, unmount } = renderComponent(
    React.createElement(CashPlannerLedger, { manager }),
  );

  assert.match(container.textContent ?? "", /Connect a sheet/);
  unmount();
});

test("CashPlannerLedger wires actions and shows totals", async () => {
  const { CashPlannerLedger } = await loadComponent();

  const duplicateCalls = [];
  const updateCalls = [];
  const removeCalls = [];
  const saveCalls = [];
  const reloadCalls = [];

  const manager = {
    status: "ready",
    blockingMessage: null,
    error: null,
    flows: [
      {
        flowId: "flow-1",
        type: "income",
        categoryId: "cat-1",
        plannedDate: "2025-02-15",
        plannedAmount: 2500,
        actualDate: "",
        actualAmount: 0,
        status: "planned",
        accountId: "acct-1",
        note: "Paycheck",
      },
      {
        flowId: "flow-2",
        type: "expense",
        categoryId: "cat-2",
        plannedDate: "2025-02-10",
        plannedAmount: -450,
        actualDate: "2025-02-11",
        actualAmount: -460,
        status: "posted",
        accountId: "acct-2",
        note: "Rent",
      },
    ],
    isDirty: true,
    isSaving: false,
    lastSavedAt: null,
    reload: async () => {
      reloadCalls.push(true);
    },
    save: async () => {
      saveCalls.push(true);
    },
    addFlow: () => {},
    updateFlow: (id, changes) => {
      updateCalls.push({ id, changes });
    },
    removeFlow: (id) => {
      removeCalls.push(id);
    },
    duplicateFlow: (id) => {
      duplicateCalls.push(id);
    },
  };

  const { container, unmount } = renderComponent(
    React.createElement(CashPlannerLedger, { manager }),
  );

  const text = container.textContent ?? "";
  assert.match(text, /Paycheck/);
  assert.match(text, /Rent/);
  assert.match(text, /\$2,500.00/);
  assert.match(text, /-\$460.00/);

  const duplicateButton = container.querySelector('button[data-flow="flow-1"][data-action="duplicate"]');
  const postButton = container.querySelector('button[data-flow="flow-1"][data-action="mark-posted"]');
  const voidButton = container.querySelector('button[data-flow="flow-1"][data-action="void"]');
  const removeButton = container.querySelector('button[data-flow="flow-1"][data-action="remove"]');
  const saveButton = container.querySelector('button[data-action="save"]');
  const reloadButton = container.querySelector('button[data-action="reload"]');

  assert.ok(duplicateButton);
  assert.ok(postButton);
  assert.ok(voidButton);
  assert.ok(removeButton);
  assert.ok(saveButton);
  assert.ok(reloadButton);

  await act(async () => {
    duplicateButton.click();
    postButton.click();
    voidButton.click();
    removeButton.click();
    saveButton.click();
    reloadButton.click();
  });

  assert.deepEqual(duplicateCalls, ["flow-1"]);
  assert.equal(removeCalls[0], "flow-1");
  assert.equal(saveCalls.length, 1);
  assert.equal(reloadCalls.length, 1);
  assert.deepEqual(updateCalls, [
    {
      id: "flow-1",
      changes: { status: "posted", actualAmount: 2500, actualDate: "2025-02-15" },
    },
    {
      id: "flow-1",
      changes: { status: "void", actualAmount: 0, actualDate: "" },
    },
  ]);

  unmount();
});
