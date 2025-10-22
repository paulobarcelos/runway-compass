// ABOUTME: Handles API requests to create and register spreadsheets.
// ABOUTME: Returns manifest payload after Drive creation succeeds.
import { NextResponse } from "next/server";

import { createAndRegisterSpreadsheet } from "@/server/google/create-spreadsheet";

type CreateAndRegister = typeof createAndRegisterSpreadsheet;

function isUnauthorized(message: string) {
  return message === "Missing authenticated session" || message === "Missing Google tokens";
}

export function createCreateHandler({
  createAndRegister = createAndRegisterSpreadsheet,
}: {
  createAndRegister?: CreateAndRegister;
} = {}) {
  return async function POST() {
    try {
      const manifest = await createAndRegister();
      return NextResponse.json({ manifest }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = isUnauthorized(message) ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };
}

export const POST = createCreateHandler();
