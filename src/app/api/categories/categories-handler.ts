// ABOUTME: Shared handler factory for categories API operations.
// ABOUTME: Allows dependency injection for testing and runtime reuse.
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
    description: string;
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

  const sanitized: CategoryRecord[] = categories.map((category) => {
    const categoryId = String(category.categoryId ?? "").trim();
    const label = String(category.label ?? "").trim();
    const color = String(category.color ?? "").trim();
    const description = String(category.description ?? "").trim();
    const sortOrder = Number.isFinite(category.sortOrder) ? category.sortOrder : 0;

    return {
      categoryId,
      label,
      color,
      description,
      sortOrder,
    };
  });

  await repository.save(sanitized);
}

type ParsedCategoriesResult =
  | { ok: true; categories: CategoryRecord[] }
  | { ok: false; error: "Missing categories payload" | "Invalid categories payload" };

function parseCategoriesPayload(value: unknown): ParsedCategoriesResult {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "Missing categories payload" };
  }

  const payload = value as Record<string, unknown>;
  const rawCategories = payload.categories;

  if (!Array.isArray(rawCategories)) {
    return { ok: false, error: "Missing categories payload" };
  }

  const categories: CategoryRecord[] = [];

  const LEGACY_KEYS = ["flowType", "rolloverFlag", "monthlyBudget", "currencyCode"];

  for (let index = 0; index < rawCategories.length; index += 1) {
    const item = rawCategories[index];

    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid categories payload" };
    }

    const {
      categoryId,
      label,
      color,
      description,
      sortOrder,
    } = item as Record<string, unknown>;

    if (typeof categoryId !== "string" || !categoryId.trim()) {
      return { ok: false, error: "Invalid categories payload" };
    }

    if (typeof label !== "string" || !label.trim()) {
      return { ok: false, error: "Invalid categories payload" };
    }

    if (typeof color !== "string" || !color.trim()) {
      return { ok: false, error: "Invalid categories payload" };
    }

    if (typeof description !== "string") {
      return { ok: false, error: "Invalid categories payload" };
    }

    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
      return { ok: false, error: "Invalid categories payload" };
    }

    for (const key of LEGACY_KEYS) {
      if (key in item && item[key as keyof typeof item] !== undefined) {
        return { ok: false, error: "Invalid categories payload" };
      }
    }

    const normalizedDescription = description.trim();

    categories.push({
      categoryId: categoryId.trim(),
      label: label.trim(),
      color: color.trim(),
      description: normalizedDescription,
      sortOrder,
    });
  }

  return { ok: true, categories };
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

    let parsed: ParsedCategoriesResult | null = null;

    try {
      const payload = await request.json();
      parsed = parseCategoriesPayload(payload);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!parsed?.ok) {
      const error = parsed?.error ?? "Missing categories payload";
      return NextResponse.json({ error }, { status: 400 });
    }

    try {
      await saveCategories({ spreadsheetId, categories: parsed.categories });
      return NextResponse.json({ categories: parsed.categories }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status =
        message === "Missing authenticated session" || message === "Missing Google tokens" ? 401 : 500;

      return NextResponse.json({ error: message }, { status });
    }
  };

  return { GET, POST };
}
