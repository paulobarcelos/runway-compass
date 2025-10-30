// ABOUTME: Verifies ledger manager hook loads entries and performs CRUD operations.
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

async function renderManager(options = {}) {
  const jiti = createTestJiti(__filename);
  const { useCashPlannerManager } = await jiti.import(
    "../src/components/cash-planner/use-cash-planner-manager",
  );

  let latest;

  function Harness() {
    latest = useCashPlannerManager(options);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(Harness));
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

test("useCashPlannerManager loads entries and exposes state", async () => {
  const fetchCalls = [];
  const harness = await renderManager({
    spreadsheetId: "sheet-123",
    fetchCashFlows: async ({ spreadsheetId }) => {
      fetchCalls.push(spreadsheetId);
      return [
        {
          flowId: "flow-1",
          date: "2025-02-15",
          amount: 2500,
          status: "posted",
          accountId: "acct-1",
          categoryId: "cat-1",
          note: "Paycheck",
        },
      ];
    },
  });

  await harness.flush();

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0], "sheet-123");

  const manager = harness.manager;

  assert.equal(manager.status, "ready");
  assert.equal(manager.error, null);
  assert.equal(manager.entries.length, 1);
  assert.equal(manager.entries[0].flowId, "flow-1");
  harness.unmount();
});

test("useCashPlannerManager surfaces fetch errors", async () => {
  const harness = await renderManager({
    spreadsheetId: "sheet-123",
    fetchCashFlows: async () => {
      throw new Error("Failed to load flows");
    },
  });

  await harness.flush();

  const manager = harness.manager;
  assert.equal(manager.status, "error");
  assert.equal(manager.error, "Failed to load flows");
  assert.equal(manager.entries.length, 0);
  harness.unmount();
});

test("useCashPlannerManager creates, updates, and deletes entries", async () => {
  const createCalls = [];
  const updateCalls = [];
  const deleteCalls = [];

  const harness = await renderManager({
    spreadsheetId: "sheet-123",
    fetchCashFlows: async () => [
      {
        flowId: "flow-1",
        date: "2025-03-01",
        amount: -450,
        status: "planned",
        accountId: "acct-1",
        categoryId: "cat-1",
        note: "Rent",
      },
    ],
    createCashFlow: async ({ draft }) => {
      createCalls.push(draft);
      return { flowId: "flow-2", ...draft };
    },
    updateCashFlow: async ({ flowId, updates }) => {
      updateCalls.push({ flowId, updates });
      return {
        flowId,
        date: "2025-03-01",
        amount: -500,
        status: "planned",
        accountId: "acct-1",
        categoryId: "cat-1",
        note: "Updated",
      };
    },
    deleteCashFlow: async ({ flowId }) => {
      deleteCalls.push(flowId);
    },
    refreshRunwayProjection: async () => ({ updatedAt: null, rowsWritten: 0 }),
  });

  await harness.flush();

  let current = harness.manager;

  await act(async () => {
    await current.createEntry({
      date: "2025-03-10",
      amount: 1200,
      status: "planned",
      accountId: "acct-1",
      categoryId: "cat-2",
      note: "Invoice",
    });
  });

  await harness.flush();
  assert.equal(createCalls.length, 1);
  current = harness.manager;
  assert.equal(current.entries.length, 2);

  await act(async () => {
    await current.updateEntry("flow-1", { amount: -500, note: "Updated" });
  });

  await harness.flush();
  assert.equal(updateCalls.length, 1);
  current = harness.manager;
  assert.equal(current.entries[0].amount, -500);
  assert.equal(current.entries[0].note, "Updated");

  await act(async () => {
    await current.deleteEntry("flow-2");
  });

  await harness.flush();
  assert.equal(deleteCalls.length, 1);
  current = harness.manager;
  assert.equal(current.entries.length, 1);

  harness.unmount();
});

test("useCashPlannerManager blocks when disabled", async () => {
  const fetchCalls = [];
  const harness = await renderManager({
    spreadsheetId: "sheet-123",
    disabled: true,
    disabledMessage: "Ledger tab disabled",
    fetchCashFlows: async ({ spreadsheetId }) => {
      fetchCalls.push(spreadsheetId);
      return [];
    },
  });

  await harness.flush();

  const manager = harness.manager;

  assert.equal(fetchCalls.length, 0);
  assert.equal(manager.status, "blocked");
  assert.equal(manager.blockingMessage, "Ledger tab disabled");
  harness.unmount();
});
