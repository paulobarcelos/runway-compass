/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

test("getSnapshotDisabledReason prefers health warnings when snapshots tab failing", async () => {
  const jiti = createTestJiti(__filename);
  const { getSnapshotDisabledReason } = await jiti.import(
    "../src/components/accounts/snapshot-utils",
  );

  const reason = getSnapshotDisabledReason({
    isPersisted: true,
    snapshotActionsDisabled: true,
    hasSnapshotBlockingErrors: true,
    hasAccountBlockingErrors: false,
  });

  assert.equal(
    reason,
    "Snapshot capture is disabled until the snapshots tab passes health checks.",
  );
});

test("getSnapshotDisabledReason warns on draft accounts", async () => {
  const jiti = createTestJiti(__filename);
  const { getSnapshotDisabledReason } = await jiti.import(
    "../src/components/accounts/snapshot-utils",
  );

  const reason = getSnapshotDisabledReason({
    isPersisted: false,
    snapshotActionsDisabled: false,
    hasSnapshotBlockingErrors: false,
    hasAccountBlockingErrors: false,
  });

  assert.equal(reason, "Save the account before capturing snapshots.");
});

test("getSnapshotDisabledReason returns null when capture allowed", async () => {
  const jiti = createTestJiti(__filename);
  const { getSnapshotDisabledReason } = await jiti.import(
    "../src/components/accounts/snapshot-utils",
  );

  const reason = getSnapshotDisabledReason({
    isPersisted: true,
    snapshotActionsDisabled: false,
    hasSnapshotBlockingErrors: false,
    hasAccountBlockingErrors: false,
  });

  assert.equal(reason, null);
});
