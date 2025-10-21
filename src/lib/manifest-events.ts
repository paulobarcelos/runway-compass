// ABOUTME: Emits manifest update notifications across client components.
// ABOUTME: Provides subscription helper for manifest change events.

import type { ManifestRecord } from "./manifest-store";

type ManifestListener = (manifest: ManifestRecord | null) => void;

const EVENT_NAME = "runway-compass:manifest-change";

export function emitManifestChange(manifest: ManifestRecord | null) {
  if (typeof window === "undefined") {
    return;
  }

  const detail = { manifest } as const;
  const event = new CustomEvent(EVENT_NAME, { detail });
  window.dispatchEvent(event);
}

export function subscribeToManifestChange(listener: ManifestListener) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ manifest: ManifestRecord | null }>;
    listener(customEvent.detail?.manifest ?? null);
  };

  window.addEventListener(EVENT_NAME, handler);

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
  };
}

export function manifestEventName() {
  return EVENT_NAME;
}
