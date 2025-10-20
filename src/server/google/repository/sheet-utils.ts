// ABOUTME: Provides helpers for mapping Sheets rows to typed records.
// ABOUTME: Normalizes row values, validates headers, and parses primitives.

export function normalizeRow(row: unknown[], length: number): string[] {
  const normalized: string[] = [];

  for (let index = 0; index < length; index += 1) {
    const value = row[index];

    if (typeof value === "string") {
      normalized.push(value);
    } else if (value == null) {
      normalized.push("");
    } else {
      normalized.push(String(value));
    }
  }

  return normalized;
}

export function isEmptyRow(row: string[]) {
  return row.every((cell) => !cell || !cell.trim());
}

export function parseBoolean(value: string) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function ensureHeaderRow(
  row: unknown[],
  headers: readonly string[],
  sheetTitle: string,
) {
  const normalized = normalizeRow(Array.isArray(row) ? row : [], headers.length);

  const matches = headers.every((header, index) => normalized[index] === header);

  if (!matches) {
    throw new Error(`${sheetTitle} header does not match expected schema`);
  }
}

export function requireInteger(
  value: string,
  {
    field,
    rowIndex,
  }: {
    field: string;
    rowIndex: number;
  },
) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`Invalid row at index ${rowIndex}: missing ${field}`);
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid row at index ${rowIndex}: ${field} must be a number`);
  }

  return parsed;
}
