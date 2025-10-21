/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

test("emitManifestChange dispatches custom event", async () => {
  global.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };

  const jiti = createJiti(__filename);
  const { emitManifestChange, subscribeToManifestChange } = await jiti.import(
    "../src/lib/manifest-events",
  );

  const listeners = new Map();

  global.window = {
    addEventListener: (name, handler) => {
      listeners.set(name, (listeners.get(name) ?? []).concat(handler));
    },
    removeEventListener: (name, handler) => {
      const current = listeners.get(name) ?? [];
      listeners.set(
        name,
        current.filter((item) => item !== handler),
      );
    },
    dispatchEvent: (event) => {
      const current = listeners.get(event.type) ?? [];
      for (const handler of current) {
        handler(event);
      }
    },
  };

  const events = [];
  const unsubscribe = subscribeToManifestChange((manifest) => {
    events.push(manifest);
  });

  emitManifestChange({ spreadsheetId: "sheet-123", storedAt: 42 });
  emitManifestChange(null);
  unsubscribe();
  emitManifestChange({ spreadsheetId: "sheet-456", storedAt: 84 });

  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { spreadsheetId: "sheet-123", storedAt: 42 });
  assert.equal(events[1], null);

  delete global.window;
  delete global.CustomEvent;
});
