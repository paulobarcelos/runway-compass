// ABOUTME: Validates local manifest storage helpers.
// ABOUTME: Ensures spreadsheet selections persist and recover safely.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

test("saveManifest stores spreadsheet identifier", async () => {
  const jiti = createTestJiti(__filename);
  const storage = createMemoryStorage();
  const { saveManifest, loadManifest } = await jiti.import(
    "../src/lib/manifest-store",
  );

  const manifest = saveManifest(storage, { spreadsheetId: "sheet-123" });
  const stored = JSON.parse(storage.getItem("runway-compass:manifest"));

  assert.equal(manifest.spreadsheetId, "sheet-123");
  assert.equal(stored.spreadsheetId, "sheet-123");
  assert.ok(typeof stored.storedAt === "number");

  const reloaded = loadManifest(storage);
  assert.equal(reloaded?.spreadsheetId, "sheet-123");

  const manifestWithStoredAt = saveManifest(storage, {
    spreadsheetId: "sheet-456",
    storedAt: 123456,
  });
  const storedOverride = JSON.parse(storage.getItem("runway-compass:manifest"));

  assert.equal(manifestWithStoredAt.spreadsheetId, "sheet-456");
  assert.equal(manifestWithStoredAt.storedAt, 123456);
  assert.equal(storedOverride.spreadsheetId, "sheet-456");
  assert.equal(storedOverride.storedAt, 123456);
});

test("loadManifest handles missing or invalid payloads", async () => {
  const jiti = createTestJiti(__filename);
  const storage = createMemoryStorage();
  const { loadManifest, clearManifest } = await jiti.import(
    "../src/lib/manifest-store",
  );

  assert.equal(loadManifest(storage), null);

  storage.setItem("runway-compass:manifest", "not-json");
  assert.equal(loadManifest(storage), null);

  storage.setItem(
    "runway-compass:manifest",
    JSON.stringify({ spreadsheetId: "sheet-123", storedAt: 10 }),
  );

  assert.equal(loadManifest(storage)?.spreadsheetId, "sheet-123");

  clearManifest(storage);
  assert.equal(loadManifest(storage), null);
});
