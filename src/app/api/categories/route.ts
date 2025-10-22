// ABOUTME: Exposes API endpoint to list category records from the spreadsheet.
// ABOUTME: Validates spreadsheet identifier and maps repository results to JSON.
import { NextResponse } from "next/server";

import { getSession } from "@/server/auth/session";
import { createSheetsClient } from "@/server/google/clients";
import {
  createCategoriesRepository,
  type CategoryRecord,
} from "@/server/google/repository/categories-repository";

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
    monthlyBudget: number;
    currencyCode: string;
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

interface SaveCategoriesOptions extends FetchCategoriesOptions {
  categories: CategoryRecord[];
}

type SaveCategories = (options: SaveCategoriesOptions) => Promise<void>;

async function saveCategoriesToSheets({
  spreadsheetId,
  categories,
}: SaveCategoriesOptions) {
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

  const sanitized = categories.map((category) => ({
    ...category,
    monthlyBudget:
      typeof category.monthlyBudget === "number" && Number.isFinite(category.monthlyBudget)
        ? category.monthlyBudget
        : 0,
    currencyCode: (category.currencyCode ?? "").trim().toUpperCase(),
  }));

  await repository.save(sanitized);
}

function parseCategoriesPayload(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const rawCategories = payload.categories;

  if (!Array.isArray(rawCategories)) {
    return null;
  }

  const categories: CategoryRecord[] = [];

  for (let index = 0; index < rawCategories.length; index += 1) {
    const item = rawCategories[index];

    if (!item || typeof item !== "object") {
      return null;
    }

    const {
      categoryId,
      label,
      color,
      rolloverFlag,
      sortOrder,
      monthlyBudget,
      currencyCode,
    } = item as Record<string, unknown>;

    if (typeof categoryId !== "string" || !categoryId.trim()) {
      return null;
    }

    if (typeof label !== "string" || !label.trim()) {
      return null;
    }

    if (typeof color !== "string" || !color.trim()) {
      return null;
    }

    if (typeof rolloverFlag !== "boolean") {
      return null;
    }

    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
      return null;
    }

    const normalizedMonthlyBudget =
      typeof monthlyBudget === "number" && Number.isFinite(monthlyBudget) ? monthlyBudget : 0;

    const normalizedCurrency = typeof currencyCode === "string" ? currencyCode.trim().toUpperCase() : "";

    categories.push({
      categoryId: categoryId.trim(),
      label: label.trim(),
      color: color.trim(),
      rolloverFlag,
      sortOrder,
      monthlyBudget: normalizedMonthlyBudget,
      currencyCode: normalizedCurrency,
    });
  }

  return categories;
}

export function createCategoriesHandler({
  fetchCategories = fetchCategoriesFromSheets,
  saveCategories = saveCategoriesToSheets,
}: {
  fetchCategories?: FetchCategories;
  saveCategories?: SaveCategories;
} = {}) {
  const GET = async (request: Request) => {
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

  const POST = async (request: Request) => {
    const url = new URL(request.url);
    const spreadsheetId = url.searchParams.get("spreadsheetId")?.trim();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Missing spreadsheetId" }, { status: 400 });
    }

    let categories: CategoryRecord[] | null = null;

    try {
      const payload = await request.json();
      categories = parseCategoriesPayload(payload);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!categories) {
      return NextResponse.json({ error: "Missing categories payload" }, { status: 400 });
    }

    try {
      await saveCategories({ spreadsheetId, categories });
      return NextResponse.json({ categories }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET, POST };
}

const handlers = createCategoriesHandler();

export const GET = handlers.GET;
export const POST = handlers.POST;

export type { FetchCategoriesOptions };
