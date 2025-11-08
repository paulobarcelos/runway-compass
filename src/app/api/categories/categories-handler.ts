// ABOUTME: Shared handler factory for categories API operations.
// ABOUTME: Allows dependency injection for testing and runtime reuse.
import { NextResponse } from "next/server";

import {
  createCategoriesActions,
  sanitizeCategoriesInput,
  type CategoryInput,
} from "@/server/categories/categories-service";
import type { CategoryRecord } from "@/server/google/repository/categories-repository";

interface FetchCategoriesOptions {
  spreadsheetId: string;
}

type FetchCategories = (options: FetchCategoriesOptions) => Promise<CategoryRecord[]>;

interface SaveCategoriesOptions {
  spreadsheetId: string;
  categories: CategoryInput[];
}

type SaveCategories = (
  options: SaveCategoriesOptions,
) => Promise<void | CategoryRecord[] | { categories: CategoryRecord[]; updatedAt?: string }>;

const defaultActions = createCategoriesActions();

async function fetchCategoriesDefault(options: FetchCategoriesOptions) {
  return defaultActions.getCategories(options);
}

async function saveCategoriesDefault(options: SaveCategoriesOptions) {
  const result = await defaultActions.saveCategories(options);
  return result.categories;
}

type ParsedCategoriesResult =
  | { ok: true; categories: CategoryInput[] }
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

  const categories: CategoryInput[] = [];

  const LEGACY_KEYS = ["flowType", "rolloverFlag", "monthlyBudget", "currencyCode"];

  for (let index = 0; index < rawCategories.length; index += 1) {
    const item = rawCategories[index];

    if (!item || typeof item !== "object") {
      return { ok: false, error: "Invalid categories payload" };
    }

    const { categoryId, label, color, description, sortOrder } = item as Record<string, unknown>;

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

    categories.push({
      categoryId: categoryId.trim(),
      label: label.trim(),
      color: color.trim(),
      description: description.trim(),
      sortOrder,
    });
  }

  return { ok: true, categories };
}

export function createCategoriesHandler({
  fetchCategories = fetchCategoriesDefault,
  saveCategories = saveCategoriesDefault,
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
      const saveResult = await saveCategories({
        spreadsheetId,
        categories: parsed.categories,
      });

      let categories: CategoryRecord[];

      if (Array.isArray(saveResult)) {
        categories = saveResult;
      } else if (saveResult && Array.isArray(saveResult.categories)) {
        categories = saveResult.categories;
      } else {
        categories = sanitizeCategoriesInput(parsed.categories);
      }

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
