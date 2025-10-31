# Debug Log Cleanup Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the `/api/dev-log` relay so debug logging is console-only behind `NEXT_PUBLIC_DEBUG_LOGS`.

**Architecture:** Delete the server route and `DEBUG_LOGS` flag usage, simplify the client helper to synchronous console output, and backfill unit tests for helper behavior.

**Tech Stack:** Next.js (App Router), TypeScript, node:test.

---

### Task 1: Add failing tests for console-only helper

**Files:**
- Create: `tests/debug-log.test.cjs`
- Delete: `tests/dev-log-route.test.cjs`

**Step 1:** Write new node:test suite showing helper no-ops when flag disabled and logs without fetch when enabled.

```javascript
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function withEnv(flag, run) {
  const original = process.env.NEXT_PUBLIC_DEBUG_LOGS;
  if (flag === undefined) {
    delete process.env.NEXT_PUBLIC_DEBUG_LOGS;
  } else {
    process.env.NEXT_PUBLIC_DEBUG_LOGS = flag;
  }

  return (async () => {
    try {
      await run();
    } finally {
      if (original === undefined) {
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
    console.info = (...args) => calls.push(args);

    try {
      const result = debugLog("ignored");
      assert.equal(result, undefined);
      assert.equal(calls.length, 0);
    } finally {
      console.info = originalInfo;
    }
  });
});
```

Add second test verifying console logging when enabled with `globalThis.window = {}` and `globalThis.fetch` spy expecting zero calls.

**Step 2:** Run `node --test tests/debug-log.test.cjs` and confirm failure because implementation still posts to server.

### Task 2: Simplify helper implementation

**Files:**
- Modify: `src/lib/debug-log.ts`

**Step 1:** Remove async fetch logic, export synchronous function that logs only when flag is true. Keep location extraction for context.

```typescript
function isDebugEnabled() {
  return process.env.NEXT_PUBLIC_DEBUG_LOGS === "true";
}

export function debugLog(message: string, data?: unknown) {
  if (!isDebugEnabled()) {
    return;
  }

  const location = extractLocation(new Error().stack);
  console.info(`[debug] ${location}: ${message}`, data);
}
```

Ensure helper no longer references `fetch` or `/api/dev-log`, and remove `sendToServer` plus related types.

**Step 2:** Run `node --test tests/debug-log.test.cjs` and ensure tests now pass.

### Task 3: Remove server route and flag usage

**Files:**
- Delete: `src/app/api/dev-log/route.ts`

**Step 1:** Remove file entirely.

**Step 2:** Run `rg "/api/dev-log"` and `rg "DEBUG_LOGS"` to confirm no remaining matches.

### Task 4: Update documentation and environment references

**Files:**
- Modify: `docs/plans/2025-10-31-debug-log-cleanup.md`
- Modify: any docs mentioning remote dev log (check `README.md`, wiki references if mirrored here)

**Step 1:** Adjust narrative to reflect console-only debug mode and note removal of `DEBUG_LOGS` flag.

**Step 2:** Ensure `.env*` files remain untouched per rules.

### Task 5: Verification

**Step 1:** Run `npm run lint`.

**Step 2:** Run `npm test`.

**Step 3:** Capture outputs for final summary.
