// ABOUTME: Returns aggregated spreadsheet health diagnostics for server clients.
// ABOUTME: Validates spreadsheet identifiers and normalizes warning/error payloads.
import { NextResponse } from "next/server";

import { fetchSpreadsheetDiagnostics } from "@/server/google/spreadsheet-health";

type FetchDiagnostics = typeof fetchSpreadsheetDiagnostics;

function isUnauthorized(message: string) {
  return message === "Missing authenticated session" || message === "Missing Google tokens";
}

export function createSpreadsheetHealthHandler({
  fetchDiagnostics = fetchSpreadsheetDiagnostics,
}: {
  fetchDiagnostics?: FetchDiagnostics;
} = {}) {
  const GET = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim() ?? "";

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const diagnostics = await fetchDiagnostics({ spreadsheetId });

      return NextResponse.json({ diagnostics }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = isUnauthorized(message) ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET };
}

const handlers = createSpreadsheetHealthHandler();

export const GET = handlers.GET;
