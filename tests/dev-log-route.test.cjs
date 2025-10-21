// ABOUTME: Tests developer log API route behavior.
// ABOUTME: Validates logging respects feature flags.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function withEnv(debugFlag, run) {
  const original = process.env.DEBUG_LOGS;
  process.env.DEBUG_LOGS = debugFlag;

  return (async () => {
    try {
      await run();
    } finally {
      if (typeof original === "undefined") {
        delete process.env.DEBUG_LOGS;
      } else {
        process.env.DEBUG_LOGS = original;
      }
    }
  })();
}

test("dev log route ignores requests when disabled", async () => {
  await withEnv(undefined, async () => {
    const route = await createTestJiti(__filename, { cache: false }).import(
      "../src/app/api/dev-log/route",
    );

    const response = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ message: "ignored" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.accepted, false);
  });
});

test("dev log route logs when enabled", async () => {
  const messages = [];
  const originalLog = console.info;
  console.info = (...args) => {
    messages.push(args);
  };

  await withEnv("true", async () => {
    const route = await createTestJiti(__filename, { cache: false }).import(
      "../src/app/api/dev-log/route",
    );

    const response = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          message: "from test",
          location: "component.tsx:10",
          data: { foo: "bar" },
          timestamp: 1700000000000,
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.accepted, true);
  });

  console.info = originalLog;
});
