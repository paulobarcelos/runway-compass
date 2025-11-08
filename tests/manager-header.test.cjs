/* eslint-disable @typescript-eslint/no-require-imports */
require("./helpers/setup-dom.cjs");
const path = require("node:path");
const { test } = require("node:test");
const assert = require("node:assert/strict");
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

test("ManagerHeader renders status pill and sheet link", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const { ManagerHeader } = require("../src/components/managers");

  await act(async () => {
    root.render(
      React.createElement(ManagerHeader, {
        title: "Budget plan",
        description: "Autosaves every few seconds",
        status: { label: "Ready", tone: "success" },
        sheetLink: {
          href: "https://example.com/sheets/budget",
          label: "Open budget sheet",
          sheetName: "Budget",
        },
        sync: {
          label: "Saved just now",
          detail: "2 changes processed",
        },
      }),
    );
  });

  const statusPill = container.querySelector('[data-testid="manager-header-status"]');
  assert.ok(statusPill, "status pill renders");
  assert.equal(statusPill?.textContent, "Ready");

  const link = container.querySelector('[data-testid="manager-header-sheet-link"]');
  assert.ok(link, "sheet link renders");
  assert.equal(link?.getAttribute("href"), "https://example.com/sheets/budget");
  assert.match(link?.textContent ?? "", /Open budget sheet/i);

  act(() => {
    root.unmount();
  });

  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }
});
