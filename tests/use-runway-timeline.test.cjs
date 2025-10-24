// ABOUTME: Validates runway timeline hook behaviour across scenarios.
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
const {
  emitManifestChange,
} = stubJiti("./helpers/stubs/manifest-events");
const {
  __setRunwayClientResponse,
  __setRunwayClientError,
  __resetRunwayClientStub,
  __getRunwayClientCalls,
  RunwayClientError,
} = stubJiti("./helpers/stubs/runway-client");

let originalFetch;

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
      "helpers/stubs/base-currency-context.tsx",
    ),
    "@/components/spreadsheet/spreadsheet-health-context": path.resolve(
      __dirname,
      "helpers/stubs/spreadsheet-health-context.tsx",
    ),
    "@/lib/manifest-store": path.resolve(__dirname, "helpers/stubs/manifest-store.ts"),
    "@/lib/manifest-events": path.resolve(
      __dirname,
      "helpers/stubs/manifest-events.ts",
    ),
    "@/lib/api/runway-client": path.resolve(
      __dirname,
      "helpers/stubs/runway-client.ts",
    ),
    "@/lib/debug-log": path.resolve(__dirname, "helpers/stubs/debug-log.ts"),
  };
}

async function renderTimeline() {
  const jiti = createTestJiti(__filename, { alias: stubAliases() });
  const { useRunwayTimeline } = await jiti.import(
    "../src/components/runway-timeline/use-runway-timeline",
  );

  let latest;

  function TestComponent() {
    latest = useRunwayTimeline();
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
    get timeline() {
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
  global.fetch = async () => ({ ok: true, json: async () => ({}) });
  __resetBaseCurrencyTestValue();
  __resetSpreadsheetHealthTestValue();
  __resetManifestRecord();
  __resetRunwayClientStub();
  if (global.window?.localStorage?.clear) {
    global.window.localStorage.clear();
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

test("useRunwayTimeline loads projection rows when manifest available", async () => {
  __setManifestRecord({ spreadsheetId: "sheet-123", storedAt: 1 });
  __setRunwayClientResponse([
    {
      month: 1,
      year: 2025,
      startingBalance: 10000,
      incomeTotal: 6000,
      expenseTotal: 4000,
      endingBalance: 12000,
      stoplightStatus: "green",
      notes: "steady",
    },
  ]);

  const view = await renderTimeline();
  await view.flush();

  const timeline = view.timeline;
  assert.equal(timeline.status, "ready");
  assert.equal(timeline.rows.length, 1);
  assert.equal(timeline.rows[0].monthLabel, "January 2025");
  assert.equal(timeline.rows[0].endingBalanceDisplay.includes("12000.00"), true);
  assert.deepEqual(__getRunwayClientCalls(), ["sheet-123"]);
  view.unmount();
});

test("useRunwayTimeline blocks when health reports errors", async () => {
  __setManifestRecord({ spreadsheetId: "sheet-xyz", storedAt: 2 });
  __setSpreadsheetHealthTestValue({
    diagnostics: {
      warnings: [],
      errors: [
        {
          sheetId: "runway_projection",
          sheetTitle: "Runway projection",
          message: "Header mismatch",
        },
      ],
      sheets: [],
    },
  });

  const view = await renderTimeline();
  await view.flush();

  const timeline = view.timeline;
  assert.equal(timeline.status, "blocked");
  assert.match(timeline.blockingMessage ?? "", /Fix the spreadsheet/i);
  assert.equal(timeline.rows.length, 0);
  assert.equal(__getRunwayClientCalls().length, 0);
  view.unmount();
});

test("useRunwayTimeline exposes error message when fetch fails", async () => {
  __setManifestRecord({ spreadsheetId: "sheet-err", storedAt: 3 });
  __setRunwayClientError(new RunwayClientError(500, "Failed to fetch"));

  const view = await renderTimeline();
  await view.flush();

  const timeline = view.timeline;
  assert.equal(timeline.status, "error");
  assert.equal(timeline.error, "Failed to fetch");
  view.unmount();
});

test("useRunwayTimeline waits for manifest selection", async () => {
  __setManifestRecord(null);

  const view = await renderTimeline();
  await view.flush();

  let timeline = view.timeline;
  assert.equal(timeline.status, "blocked");
  assert.match(timeline.blockingMessage ?? "", /Connect a spreadsheet/i);
  assert.equal(__getRunwayClientCalls().length, 0);

  __setManifestRecord({ spreadsheetId: "sheet-activate", storedAt: 4 });
  await act(async () => {
    emitManifestChange({ spreadsheetId: "sheet-activate", storedAt: 4 });
    await Promise.resolve();
  });
  await view.flush();

  timeline = view.timeline;
  assert.equal(timeline.status, "ready");
  view.unmount();
});
