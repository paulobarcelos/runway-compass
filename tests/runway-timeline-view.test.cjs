// ABOUTME: Ensures the runway timeline view renders states and rows.
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

async function loadView() {
  return require("../src/components/runway-timeline/runway-timeline-view");
}

function render(element) {
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

test("RunwayTimelineView shows loading state", async () => {
  const { RunwayTimelineView } = await loadView();
  const timeline = {
    status: "loading",
    blockingMessage: null,
    error: null,
    rows: [],
    lastUpdatedAt: null,
    refresh: async () => {},
  };

  const { container, unmount } = render(
    React.createElement(RunwayTimelineView, { timeline }),
  );

  assert.match(container.textContent ?? "", /Loading runway timeline/i);
  unmount();
});

test("RunwayTimelineView shows blocking message", async () => {
  const { RunwayTimelineView } = await loadView();
  const timeline = {
    status: "blocked",
    blockingMessage: "Fix the runway projection tab",
    error: null,
    rows: [],
    lastUpdatedAt: null,
    refresh: async () => {},
  };

  const { container, unmount } = render(
    React.createElement(RunwayTimelineView, { timeline }),
  );

  assert.match(container.textContent ?? "", /Fix the runway projection tab/);
  unmount();
});

test("RunwayTimelineView renders projection rows", async () => {
  const { RunwayTimelineView } = await loadView();
  const refreshCalls = [];
  const timeline = {
    status: "ready",
    blockingMessage: null,
    error: null,
    rows: [
      {
        id: "2025-01",
        month: 1,
        year: 2025,
        monthLabel: "January 2025",
        startingBalanceDisplay: "10,000.00 USD",
        incomeDisplay: "6,000.00 USD",
        expenseDisplay: "4,000.00 USD",
        endingBalanceDisplay: "12,000.00 USD",
        netChangeDisplay: "+2,000.00 USD",
        endingBalanceValue: 12000,
        stoplightStatus: "green",
        notes: "stable",
      },
      {
        id: "2025-02",
        month: 2,
        year: 2025,
        monthLabel: "February 2025",
        startingBalanceDisplay: "12,000.00 USD",
        incomeDisplay: "3,000.00 USD",
        expenseDisplay: "5,000.00 USD",
        endingBalanceDisplay: "10,000.00 USD",
        netChangeDisplay: "-2,000.00 USD",
        endingBalanceValue: 10000,
        stoplightStatus: "yellow",
        notes: "monitor",
      },
    ],
    lastUpdatedAt: "2025-03-01T12:00:00.000Z",
    refresh: async () => {
      refreshCalls.push(Date.now());
    },
  };

  const { container, unmount } = render(
    React.createElement(RunwayTimelineView, { timeline }),
  );

  assert.match(container.textContent ?? "", /January 2025/);
  assert.match(container.textContent ?? "", /12,000.00 USD/);
  assert.match(container.textContent ?? "", /Net change/);

  const buttons = Array.from(container.querySelectorAll("button"));
  const refreshButton = buttons.find((button) => /Refresh/.test(button.textContent ?? ""));
  assert.ok(refreshButton);

  await act(async () => {
    refreshButton.click();
    await Promise.resolve();
  });

  assert.equal(refreshCalls.length, 1);
  unmount();
});
