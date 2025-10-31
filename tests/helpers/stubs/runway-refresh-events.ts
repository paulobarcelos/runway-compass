interface RunwayProjectionUpdatedPayload {
  spreadsheetId: string;
  updatedAt: string | null;
  rowsWritten: number;
}

let listeners: Array<(payload: RunwayProjectionUpdatedPayload) => void> = [];

export function emitRunwayProjectionUpdated(payload: RunwayProjectionUpdatedPayload) {
  for (const listener of listeners) {
    listener(payload);
  }
}

export function subscribeToRunwayProjectionUpdated(
  listener: (payload: RunwayProjectionUpdatedPayload) => void,
) {
  listeners.push(listener);

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
  };
}

export function __resetRunwayProjectionListeners() {
  listeners = [];
}

export function runwayProjectionUpdatedEventName() {
  return "stubbed";
}
