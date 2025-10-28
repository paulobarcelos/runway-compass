export interface SnapshotAvailabilityOptions {
  isPersisted: boolean;
  snapshotActionsDisabled: boolean;
  hasSnapshotBlockingErrors: boolean;
  hasAccountBlockingErrors: boolean;
}

export function getSnapshotDisabledReason({
  isPersisted,
  snapshotActionsDisabled,
  hasSnapshotBlockingErrors,
  hasAccountBlockingErrors,
}: SnapshotAvailabilityOptions): string | null {
  if (snapshotActionsDisabled) {
    if (hasSnapshotBlockingErrors && !hasAccountBlockingErrors) {
      return "Snapshot capture is disabled until the snapshots tab passes health checks.";
    }

    return null;
  }

  if (!isPersisted) {
    return "Save the account before capturing snapshots.";
  }

  return null;
}
