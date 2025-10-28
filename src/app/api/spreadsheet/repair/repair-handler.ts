// ABOUTME: Shared factory for spreadsheet repair route logic.
// ABOUTME: Performs dependency-injected bootstrap calls and validates payloads.
import { NextResponse } from "next/server";

import { bootstrapExistingSpreadsheet } from "@/server/google/bootstrap";
import { REQUIRED_SHEETS } from "@/server/google/sheet-schemas";

type RepairHandler = typeof bootstrapExistingSpreadsheet;

const CANONICAL_TITLES = new Map(
  REQUIRED_SHEETS.map((schema) => [schema.title.toLowerCase(), schema.title] as const),
);

function toCanonicalSheetTitle(value: string) {
  const lookupKey = value.trim().toLowerCase();
  return lookupKey ? CANONICAL_TITLES.get(lookupKey) ?? null : null;
}

function normalizeSheetList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const canonical = toCanonicalSheetTitle(entry);

    if (!canonical) {
      continue;
    }

    if (!normalized.includes(canonical)) {
      normalized.push(canonical);
    }
  }

  return normalized.length > 0 ? normalized : undefined;
}

function isUnauthorized(message: string) {
  return message === "Missing authenticated session" || message === "Missing Google tokens";
}

export function createRepairHandler({
  repair = bootstrapExistingSpreadsheet,
}: {
  repair?: RepairHandler;
} = {}) {
  return async function POST(request: Request) {
    let body: Record<string, unknown>;

    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const spreadsheetId =
      typeof body.spreadsheetId === "string" ? body.spreadsheetId.trim() : "";

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    const sheetTitles = normalizeSheetList(body.sheets);

    try {
      const result = await repair({
        spreadsheetId,
        sheetTitles,
      });

      return NextResponse.json(
        {
          manifest: {
            spreadsheetId: result.spreadsheetId,
            schemaVersion: result.schemaVersion,
            bootstrappedAt: result.bootstrappedAt,
            storedAt: result.storedAt,
          },
          repairedSheets: result.repairedSheets,
        },
        { status: 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = isUnauthorized(message) ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };
}
