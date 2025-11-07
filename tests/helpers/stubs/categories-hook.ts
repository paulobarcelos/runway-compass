// ABOUTME: Provides controllable stub data for useCategories hook consumers in tests.
import type { CategoryDraft } from "@/components/categories/category-helpers";
import type { UseQueryResult } from "@tanstack/react-query";

let categoriesBySheet = new Map<string, CategoryDraft[]>();
let defaultCategories: CategoryDraft[] = [];
let nextError: Error | null = null;

export function __setCategoriesHookDefault(categories: CategoryDraft[]) {
  defaultCategories = categories.map((draft) => ({ ...draft }));
}

export function __setCategoriesHookData(spreadsheetId: string, categories: CategoryDraft[]) {
  categoriesBySheet.set(
    spreadsheetId,
    categories.map((draft) => ({ ...draft })),
  );
}

export function __setCategoriesHookError(error: Error | null) {
  nextError = error;
}

export function __resetCategoriesHookStub() {
  categoriesBySheet = new Map();
  defaultCategories = [];
  nextError = null;
}

export function useCategories(spreadsheetId: string | null): {
  query: Pick<UseQueryResult<CategoryDraft[]>, "data" | "isLoading" | "isError" | "error" | "status">;
} {
  const enabled = typeof spreadsheetId === "string" && spreadsheetId.length > 0;
  const data = enabled
    ? categoriesBySheet.get(spreadsheetId!) ?? defaultCategories
    : [];

  if (nextError) {
    return {
      query: {
        data: [],
        isLoading: false,
        isError: true,
        error: nextError,
        status: "error",
      },
    };
  }

  return {
    query: {
      data,
      isLoading: !enabled,
      isError: false,
      error: null,
      status: enabled ? "success" : "pending",
    },
  };
}
