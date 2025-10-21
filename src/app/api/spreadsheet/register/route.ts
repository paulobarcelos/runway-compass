// ABOUTME: Handles spreadsheet registration requests from authenticated clients.
// ABOUTME: Persists manifest metadata and returns selection manifest.
import { NextResponse } from "next/server";

import { registerSpreadsheetSelection } from "@/server/google/register-spreadsheet";

interface RegisterBody {
  spreadsheetId?: string;
}

type RegisterSpreadsheet = typeof registerSpreadsheetSelection;

function unauthorizedError(message: string) {
  return message === "Missing authenticated session" || message === "Missing Google tokens";
}

export function createRegisterHandler({
  register = registerSpreadsheetSelection,
}: {
  register?: RegisterSpreadsheet;
} = {}) {
  return async function POST(request: Request) {
    let body: RegisterBody;

  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

    const spreadsheetId = typeof body.spreadsheetId === "string" ? body.spreadsheetId : "";

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const manifest = await register({ spreadsheetId });

      return NextResponse.json({ manifest }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = unauthorizedError(message) ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };
}

export const POST = createRegisterHandler();

export type { RegisterBody };
