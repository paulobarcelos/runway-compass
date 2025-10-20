// ABOUTME: Persists selected spreadsheet manifest to local storage.
// ABOUTME: Reloads spreadsheet identifier for reconnecting client sessions.

export interface ManifestRecord {
  spreadsheetId: string;
  storedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const MANIFEST_STORAGE_KEY = "runway-compass:manifest";

export function saveManifest(
  storage: StorageLike,
  payload: { spreadsheetId: string },
): ManifestRecord {
  const record: ManifestRecord = {
    spreadsheetId: payload.spreadsheetId,
    storedAt: Date.now(),
  };

  storage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(record));

  return record;
}

export function loadManifest(storage: StorageLike): ManifestRecord | null {
  const raw = storage.getItem(MANIFEST_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ManifestRecord;

    if (typeof parsed?.spreadsheetId !== "string") {
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

export function clearManifest(storage: StorageLike) {
  storage.removeItem(MANIFEST_STORAGE_KEY);
}

export function manifestStorageKey() {
  return MANIFEST_STORAGE_KEY;
}
