// ABOUTME: Shared handler factory for runway projection API route.
// ABOUTME: Fetches projection rows from Sheets and normalizes responses.
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import {
  createRunwayProjectionRepository,
  type RunwayProjectionRecord,
} from "@/server/google/repository/runway-projection-repository";

interface FetchRunwayProjectionOptions {
  spreadsheetId: string;
}

type FetchRunwayProjection = (
  options: FetchRunwayProjectionOptions,
) => Promise<RunwayProjectionRecord[]>;

async function fetchRunwayProjectionFromSheets({
  spreadsheetId,
}: FetchRunwayProjectionOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const repository = createRunwayProjectionRepository({
    sheets,
    spreadsheetId,
  });

  return repository.list();
}

export function createRunwayHandler({
  fetchRunwayProjection = fetchRunwayProjectionFromSheets,
}: { fetchRunwayProjection?: FetchRunwayProjection } = {}) {
  const GET = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const runway = await fetchRunwayProjection({ spreadsheetId });
      return NextResponse.json({ runway }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens"
          ? 401
          : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET };
}

export type { FetchRunwayProjectionOptions };
