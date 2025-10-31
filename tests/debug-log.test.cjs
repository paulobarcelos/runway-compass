// ABOUTME: Tests client debug logging helper now that it only writes to console.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function withEnv(flag, run) {
  const original = process.env.NEXT_PUBLIC_DEBUG_LOGS;

  if (typeof flag === "undefined") {
    delete process.env.NEXT_PUBLIC_DEBUG_LOGS;
  } else {
    process.env.NEXT_PUBLIC_DEBUG_LOGS = flag;
  }

  return (async () => {
    try {
      await run();
    } finally {
      if (typeof original === "undefined") {
        delete process.env.NEXT_PUBLIC_DEBUG_LOGS;
      } else {
        process.env.NEXT_PUBLIC_DEBUG_LOGS = original;
      }
    }
  })();
}

test("debugLog returns immediately when flag disabled", async () => {
  await withEnv(undefined, async () => {
    const jiti = createTestJiti(__filename, { cache: false });
    const { debugLog } = await jiti.import("../src/lib/debug-log");

    const calls = [];
    const originalInfo = console.info;
    console.info = (...args) => {
      calls.push(args);
    };

    try {
      const result = debugLog("ignored");
      assert.equal(result, undefined);
      assert.equal(calls.length, 0);
    } finally {
      console.info = originalInfo;
    }
  });
});

test("debugLog logs to console without sending network requests when enabled", async () => {
  await withEnv("true", async () => {
    const jiti = createTestJiti(__filename, { cache: false });
    const { debugLog } = await jiti.import("../src/lib/debug-log");

    const originalInfo = console.info;
    const originalWindow = globalThis.window;
    const originalFetch = globalThis.fetch;

    const consoleCalls = [];
    let fetchCalls = 0;

    console.info = (...args) => {
      consoleCalls.push(args);
    };

    globalThis.window = {};
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      };
    };

    try {
      const result = debugLog("from test", { foo: "bar" });
      assert.equal(result, undefined);
      assert.equal(consoleCalls.length, 1);
      const [infoArgs] = consoleCalls;
      assert.deepEqual(infoArgs, ["[debug]", "from test", { foo: "bar" }]);
      assert.equal(fetchCalls, 0);
    } finally {
      console.info = originalInfo;

      if (typeof originalWindow === "undefined") {
        delete globalThis.window;
      } else {
        globalThis.window = originalWindow;
      }

      if (typeof originalFetch === "undefined") {
        delete globalThis.fetch;
      } else {
        globalThis.fetch = originalFetch;
      }
    }
  });
});
