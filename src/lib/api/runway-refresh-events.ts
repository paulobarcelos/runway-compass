// ABOUTME: Emits and subscribes to client-side runway projection refresh events.
// ABOUTME: Allows timeline consumers to reload when projections update.

export interface RunwayProjectionUpdatedPayload {
  spreadsheetId: string;
  updatedAt: string | null;
  rowsWritten: number;
}

const EVENT_NAME = "runway-compass:runway-projection-updated";

export function emitRunwayProjectionUpdated(payload: RunwayProjectionUpdatedPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized: RunwayProjectionUpdatedPayload = {
    spreadsheetId: payload.spreadsheetId?.trim() ?? "",
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : null,
    rowsWritten:
      typeof payload.rowsWritten === "number" && Number.isFinite(payload.rowsWritten)
        ? payload.rowsWritten
        : 0,
  };

  let event: Event;

  if (typeof window.CustomEvent === "function") {
    event = new window.CustomEvent(EVENT_NAME, { detail: normalized });
  } else {
    event = new window.Event(EVENT_NAME);
    Object.assign(event, { detail: normalized });
  }

  window.dispatchEvent(event);
}

export function subscribeToRunwayProjectionUpdated(
  listener: (payload: RunwayProjectionUpdatedPayload) => void,
) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<Partial<RunwayProjectionUpdatedPayload>>;
    const detail = customEvent.detail ?? {};

    listener({
      spreadsheetId:
        typeof detail.spreadsheetId === "string" ? detail.spreadsheetId : "",
      updatedAt: typeof detail.updatedAt === "string" ? detail.updatedAt : null,
      rowsWritten:
        typeof detail.rowsWritten === "number" && Number.isFinite(detail.rowsWritten)
          ? detail.rowsWritten
          : 0,
    });
  };

  window.addEventListener(EVENT_NAME, handler);

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

export function runwayProjectionUpdatedEventName() {
  return EVENT_NAME;
}
