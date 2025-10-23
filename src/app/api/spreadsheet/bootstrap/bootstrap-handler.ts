// ABOUTME: Shared handler factory for spreadsheet bootstrap API.
// ABOUTME: Resets sheet schema and returns manifest metadata.
import { NextResponse } from "next/server";

import { bootstrapExistingSpreadsheet } from "@/server/google/bootstrap";

type BootstrapHandler = typeof bootstrapExistingSpreadsheet;

function isUnauthorized(message: string) {
  return message === "Missing authenticated session" || message === "Missing Google tokens";
}

export function createBootstrapHandler({
  bootstrap = bootstrapExistingSpreadsheet,
}: {
  bootstrap?: BootstrapHandler;
} = {}) {
  return async function POST(request: Request) {
    let spreadsheetId = "";

    try {
      const data = (await request.json()) as { spreadsheetId?: unknown };
      if (typeof data.spreadsheetId === "string") {
        spreadsheetId = data.spreadsheetId.trim();
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const result = await bootstrap({ spreadsheetId });

      return NextResponse.json(
        {
          manifest: {
            spreadsheetId: result.spreadsheetId,
            storedAt: result.storedAt,
            schemaVersion: result.schemaVersion,
            bootstrappedAt: result.bootstrappedAt,
          },
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
