// ABOUTME: Mocks the manifest store for client-side unit tests.
// ABOUTME: Lets tests control the spreadsheet manifest without touching storage.

export interface ManifestRecord {
  spreadsheetId: string | null;
  storedAt: number | null;
}

let currentManifest: ManifestRecord | null = null;

export function __setManifestRecord(manifest: ManifestRecord | null) {
  currentManifest = manifest;
}

export function __resetManifestRecord() {
  currentManifest = null;
}

export function loadManifest(): ManifestRecord | null {
  return currentManifest;
}

export function manifestStorageKey() {
  return "stub:manifest";
}
