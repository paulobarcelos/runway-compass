// ABOUTME: Exposes API endpoint to list category records from the spreadsheet.
// ABOUTME: Validates spreadsheet identifier and maps repository results to JSON.
import { NextResponse } from "next/server";

import { getSession } from "../../../server/auth/session";
import { createSheetsClient } from "../../../server/google/clients";
import { createCategoriesRepository } from "../../../server/google/repository/categories-repository";

interface FetchCategoriesOptions {
  spreadsheetId: string;
}

type FetchCategories = (options: FetchCategoriesOptions) => Promise<
  Array<{
    categoryId: string;
    label: string;
    color: string;
    rolloverFlag: boolean;
    sortOrder: number;
  }>
>;

async function fetchCategoriesFromSheets({ spreadsheetId }: FetchCategoriesOptions) {
  const session = await getSession();

  if (!session) {
    throw new Error("Missing authenticated session");
  }

  const tokens = session.googleTokens;

  if (!tokens?.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
    throw new Error("Missing Google tokens");
  }

  const sheets = createSheetsClient(tokens);
  const repository = createCategoriesRepository({ sheets, spreadsheetId });

  return repository.list();
}

export function createCategoriesHandler({
  fetchCategories = fetchCategoriesFromSheets,
}: {
  fetchCategories?: FetchCategories;
} = {}) {
  return async function GET(request: Request) {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    try {
      const categories = await fetchCategories({ spreadsheetId });

      return NextResponse.json({ categories }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };
}

export const GET = createCategoriesHandler();

export type { FetchCategoriesOptions };
