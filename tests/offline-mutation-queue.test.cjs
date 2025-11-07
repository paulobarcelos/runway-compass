// ABOUTME: Ensures offline mutation queue surfaces failures after reconnection.
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

const originalWindowOnlineDescriptor = Object.getOwnPropertyDescriptor(
  window.navigator,
  "onLine",
);
const originalGlobalOnlineDescriptor = global.navigator
  ? Object.getOwnPropertyDescriptor(global.navigator, "onLine")
  : undefined;
const originalOnlineValue = window.navigator.onLine;

function setNavigatorOnline(value) {
  const descriptor = {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  };

  Object.defineProperty(window.navigator, "onLine", descriptor);

  if (global.navigator) {
    Object.defineProperty(global.navigator, "onLine", descriptor);
  }
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  if (originalWindowOnlineDescriptor) {
    Object.defineProperty(window.navigator, "onLine", originalWindowOnlineDescriptor);
  } else {
    setNavigatorOnline(originalOnlineValue);
  }

  if (global.navigator) {
    if (originalGlobalOnlineDescriptor) {
      Object.defineProperty(global.navigator, "onLine", originalGlobalOnlineDescriptor);
    } else {
      Object.defineProperty(global.navigator, "onLine", {
        configurable: true,
        writable: true,
        enumerable: true,
        value: originalOnlineValue,
      });
    }
  }
});

async function renderQueue(initialMutateAsync, initialQueueOptions) {
  const jiti = createTestJiti(__filename);
  const { useOfflineMutationQueue } = await jiti.import(
    "../src/lib/query/offline-mutation-queue",
  );

  let latest;

  function Harness({ mutateAsync, queueOptions }) {
    const mutation = React.useMemo(
      () =>
        ({
          mutateAsync,
        }),
      [mutateAsync],
    );
    latest = useOfflineMutationQueue(mutation, queueOptions);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  let currentMutate = initialMutateAsync;
  let currentOptions = initialQueueOptions;

  async function renderWith(fn, nextOptions) {
    if (typeof fn === "function") {
      currentMutate = fn;
    }
    if (nextOptions !== undefined) {
      currentOptions = nextOptions;
    }

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          mutateAsync: currentMutate,
          queueOptions: currentOptions,
        }),
      );
    });
  }

  await renderWith(initialMutateAsync, initialQueueOptions);

  return {
    get queue() {
      return latest;
    },
    async rerender(fn, nextOptions) {
      await renderWith(fn, nextOptions);
    },
    cleanup() {
      act(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

function installManualFakeTimers() {
  const originals = {
    windowSetTimeout: window.setTimeout,
    windowClearTimeout: window.clearTimeout,
    globalSetTimeout: global.setTimeout,
    globalClearTimeout: global.clearTimeout,
  };

  let now = 0;
  let nextId = 1;
  const tasks = [];

  const sortTasks = () => {
    tasks.sort((a, b) => a.time - b.time);
  };

  const setTimeoutStub = (callback, delay = 0, ...args) => {
    const timeout = Math.max(0, Number(delay) || 0);
    const id = nextId++;
    tasks.push({ id, time: now + timeout, callback, args });
    sortTasks();
    return id;
  };

  const clearTimeoutStub = (id) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index >= 0) {
      tasks.splice(index, 1);
    }
  };

  const advanceTimersByTime = (milliseconds) => {
    const target = now + Math.max(0, Number(milliseconds) || 0);
    while (tasks.length > 0) {
      sortTasks();
      const next = tasks[0];
      if (!next || next.time > target) {
        break;
      }

      tasks.shift();
      now = next.time;
      next.callback(...next.args);
    }
    now = target;
  };

  window.setTimeout = setTimeoutStub;
  window.clearTimeout = clearTimeoutStub;
  global.setTimeout = setTimeoutStub;
  global.clearTimeout = clearTimeoutStub;

  return {
    advanceTimersByTime,
    restore() {
      window.setTimeout = originals.windowSetTimeout;
      window.clearTimeout = originals.windowClearTimeout;
      global.setTimeout = originals.globalSetTimeout;
      global.clearTimeout = originals.globalClearTimeout;
      tasks.length = 0;
      now = 0;
    },
  };
}

beforeEach(() => {
  setNavigatorOnline(true);
});

test("queued mutations reject when flush fails online", async () => {
  const rejection = new Error("Server rejected payload");

  setNavigatorOnline(false);

  const view = await renderQueue(async () => {
    throw new Error("should not run while offline");
  });

  let queuedResultPromise;
  await act(async () => {
    queuedResultPromise = view.queue
      .enqueue({ id: "offline" })
      .then(
        (value) => ({ status: "fulfilled", value }),
        (error) => ({ status: "rejected", reason: error }),
      );
  });
  await flushMicrotasks();

  assert.equal(view.queue.pending, 1, "payload added to queue");
  assert.equal(view.queue.isOnline, false, "queue reports offline");

  const invocationLog = [];
  await view.rerender(async () => {
    invocationLog.push("called");
    throw rejection;
  });

  setNavigatorOnline(true);
  await act(async () => {
    window.dispatchEvent(new window.Event("online"));
  });
  await flushMicrotasks();
  await act(async () => {
    await view.queue.flush().catch(() => {});
  });
  await flushMicrotasks();

  const result = await queuedResultPromise;

  assert.equal(result?.status, "rejected", "queued promise rejects");
  assert.ok(
    result?.status === "rejected" &&
      result.reason instanceof Error &&
      /Server rejected payload/.test(result.reason.message),
    "queued promise rejects with server error",
  );
  assert.equal(invocationLog.length, 1, "mutation invoked once");
  assert.equal(view.queue.pending, 0, "queue clears failed entry");

  view.cleanup();
});

test("enqueue while offline replaces pending entry with latest snapshot", async () => {
  setNavigatorOnline(false);

  const payloads = [];
  const view = await renderQueue(async (variables) => {
    payloads.push(variables);
    return null;
  });

  await act(async () => {
    void view.queue.enqueue({ version: 1 });
  });
  await flushMicrotasks();

  assert.equal(view.queue.pending, 1, "initial offline enqueue adds single entry");

  let secondPromise;
  await act(async () => {
    secondPromise = view.queue.enqueue({ version: 2 });
  });
  await flushMicrotasks();

  assert.equal(view.queue.pending, 1, "replacing snapshot does not grow queue");

  await view.rerender(async (variables) => {
    payloads.push(variables);
    return null;
  });

  setNavigatorOnline(true);
  await act(async () => {
    window.dispatchEvent(new window.Event("online"));
  });
  await flushMicrotasks();
  await act(async () => {
    await view.queue.flush();
  });
  await flushMicrotasks();

  const result = await secondPromise;
  assert.equal(result, null, "resolved promise yields null payload");
  assert.deepEqual(payloads, [{ version: 2 }], "only latest snapshot is flushed once");
  assert.equal(view.queue.pending, 0, "queue drains after flush");

  view.cleanup();
});

test("online reconnect waits for delay before flushing queue once", async () => {
  setNavigatorOnline(false);

  const timers = installManualFakeTimers();
  const flushedPayloads = [];
  let reconnectCalls = 0;

  const view = await renderQueue(
    async (variables) => {
      flushedPayloads.push(variables);
      return null;
    },
    {
      reconnectDelayMs: 200,
      onReconnect: () => {
        reconnectCalls += 1;
      },
    },
  );

  let pendingResult;

  try {
    await act(async () => {
      pendingResult = view.queue.enqueue({ version: "latest" });
    });
    await flushMicrotasks();

    setNavigatorOnline(true);
    await act(async () => {
      window.dispatchEvent(new window.Event("online"));
    });
    await flushMicrotasks();

    assert.equal(flushedPayloads.length, 0, "flush does not happen before delay");

    timers.advanceTimersByTime(150);
    await flushMicrotasks();
    assert.equal(flushedPayloads.length, 0, "queue still pending before timer completes");

    timers.advanceTimersByTime(100);
    await flushMicrotasks();

    assert.deepEqual(flushedPayloads, [{ version: "latest" }], "delayed flush runs once");
    const resolved = await pendingResult;
    assert.equal(resolved, null, "offline enqueue resolves after reconnect flush");
    assert.equal(reconnectCalls, 1, "onReconnect runs after successful flush");

    timers.advanceTimersByTime(1000);
    await flushMicrotasks();
    assert.equal(flushedPayloads.length, 1, "no duplicate flush after reconnect");
  } finally {
    timers.restore();
    view.cleanup();
  }
});

test("resetKey clears queued payloads when spreadsheet changes", async () => {
  setNavigatorOnline(false);

  const view = await renderQueue(
    async () => {
      throw new Error("should not flush while offline");
    },
    { resetKey: "sheet-123" },
  );

  await act(async () => {
    void view.queue.enqueue({ version: "sheet-123" });
  });
  await flushMicrotasks();

  assert.equal(view.queue.pending, 1, "initial queue holds payload");

  await view.rerender(undefined, { resetKey: "sheet-456" });
  await flushMicrotasks();

  assert.equal(view.queue.pending, 0, "queue clears when resetKey changes");
  view.cleanup();
});
