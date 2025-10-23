// ABOUTME: Supplies a minimal event emitter for manifest updates in tests.
// ABOUTME: Allows hooks to react to manifest changes without browser APIs.

type Listener = (manifest: unknown) => void;

const listeners = new Set<Listener>();

export function subscribeToManifestChange(callback: Listener) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function emitManifestChange(manifest: unknown) {
  for (const listener of Array.from(listeners)) {
    listener(manifest);
  }
}
