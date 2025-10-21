/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

function createDependencies() {
  const sleeps = [];

  return {
    sleeps,
    deps: {
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.4,
    },
  };
}

test("executeWithRetry resolves immediately when the first attempt succeeds", async () => {
  const jiti = createJiti(__filename);
  const { executeWithRetry } = await jiti.import(
    "../src/server/google/retry",
  );

  const { deps, sleeps } = createDependencies();
  let attempts = 0;

  const result = await executeWithRetry(
    async () => {
      attempts += 1;
      return "ok";
    },
    {},
    deps,
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 1);
  assert.deepEqual(sleeps, []);
});

test("executeWithRetry retries on rate-limited errors using backoff", async () => {
  const jiti = createJiti(__filename);
  const { executeWithRetry } = await jiti.import(
    "../src/server/google/retry",
  );

  const { deps, sleeps } = createDependencies();
  let attempts = 0;

  const result = await executeWithRetry(
    async () => {
      attempts += 1;

      if (attempts === 1) {
        const error = new Error("Too many requests");
        error.code = 429;
        throw error;
      }

      return "ok";
    },
    { baseDelayMs: 200 },
    deps,
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
  assert.equal(sleeps.length, 1);
  assert.equal(sleeps[0], 200 * 0.7);
});

test("executeWithRetry throws after exhausting attempts", async () => {
  const jiti = createJiti(__filename);
  const { executeWithRetry } = await jiti.import(
    "../src/server/google/retry",
  );

  const { deps, sleeps } = createDependencies();
  let attempts = 0;

  await assert.rejects(
    () =>
      executeWithRetry(
        async () => {
          attempts += 1;
          const error = new Error("Service unavailable");
          error.code = 503;
          throw error;
        },
        { maxAttempts: 3, baseDelayMs: 100 },
        deps,
      ),
    /Service unavailable/,
  );

  assert.equal(attempts, 3);
  assert.equal(sleeps.length, 2);
  assert.deepEqual(sleeps, [70, 140]);
});
