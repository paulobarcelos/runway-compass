// ABOUTME: Verifies loading, editing, duplication, saving, and error handling for cash planner manager.
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

test("useCashPlannerManager loads flows and exposes state", async () => {
  const fetchCalls = [];
  const harness = await renderManager({
    spreadsheetId: "sheet-123",
    fetchCashFlows: async ({ spreadsheetId }) => {
      fetchCalls.push(spreadsheetId);
      return [
        {
          flowId: "flow-1",
          type: "income",
          categoryId: "cat-1",
          plannedDate: "2025-02-15",
          plannedAmount: 2500,
          actualDate: "2025-02-20",
          actualAmount: 2550,
          status: "posted",
          accountId: "acct-1",
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
  assert.equal(manager.flows.length, 1);
  assert.equal(manager.flows[0].flowId, "flow-1");
  assert.equal(manager.isDirty, false);
  assert.equal(typeof manager.reload, "function");
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
  assert.equal(manager.flows.length, 0);
  harness.unmount();
});

test("useCashPlannerManager supports editing and duplication", async () => {
  const harness = await renderManager({
    spreadsheetId: "sheet-123",
    fetchCashFlows: async () => [
      {
        flowId: "flow-1",
        type: "expense",
        categoryId: "cat-1",
        plannedDate: "2025-03-01",
        plannedAmount: -450,
        actualDate: "",
        actualAmount: 0,
        status: "planned",
        accountId: "",
        note: "Rent",
      },
    ],
  });

  await harness.flush();

  const manager = harness.manager;
  await act(async () => {
    manager.updateFlow("flow-1", { plannedAmount: -500, note: "Updated" });
    manager.duplicateFlow("flow-1");
  });

  await harness.flush();

  const updated = harness.manager;

  assert.equal(updated.flows.length, 2);
  assert.equal(updated.flows[0].plannedAmount, -500);
  assert.equal(updated.flows[0].note, "Updated");
  assert.equal(updated.flows[1].status, "planned");
  assert.equal(updated.flows[1].actualAmount, 0);
  assert.notEqual(updated.flows[1].flowId, "flow-1");
  assert.equal(updated.isDirty, true);
  harness.unmount();
});

test("useCashPlannerManager saves changes and resets dirty state", async () => {
  const saveCalls = [];
  const harness = await renderManager({
    spreadsheetId: "sheet-123",
    fetchCashFlows: async () => [
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
    ],
    saveCashFlows: async ({ spreadsheetId, flows }) => {
      saveCalls.push({ spreadsheetId, flows });
    },
  });

  await harness.flush();

  const manager = harness.manager;
  await act(async () => {
    manager.updateFlow("flow-1", { plannedAmount: 2600 });
  });

  await harness.flush();
  const updated = harness.manager;
  assert.equal(updated.isDirty, true);

  await act(async () => {
    await updated.save();
  });
  await harness.flush();

  const finalState = harness.manager;

  assert.equal(saveCalls.length, 1);
  assert.equal(saveCalls[0].spreadsheetId, "sheet-123");
  assert.equal(saveCalls[0].flows[0].plannedAmount, 2600);
  assert.equal(finalState.isSaving, false);
  assert.equal(finalState.isDirty, false);
  assert.ok(finalState.lastSavedAt);
  harness.unmount();
});
