// ABOUTME: Provides controllable categories server actions responses for hook tests.
import type { CategoryDraft } from "@/components/categories/category-helpers";

interface SavePayload {
  spreadsheetId: string;
  categories: CategoryDraft[];
}

type CategoriesResponse = Array<Record<string, unknown>>;

let nextQueryResponse: CategoriesResponse = [];
let nextQueryError: unknown = null;
let nextMutationResponse: CategoriesResponse = [];
let nextMutationError: unknown = null;

const queryCalls: string[] = [];
const mutationCalls: SavePayload[] = [];

function cloneCategories(records: CategoriesResponse): CategoriesResponse {
  return records.map((record) => ({ ...record }));
}

export function __setCategoriesQueryResponse(records: CategoriesResponse) {
  nextQueryResponse = cloneCategories(records);
  nextQueryError = null;
}

export function __setCategoriesQueryError(error: unknown) {
  nextQueryError = error;
}

export function __setCategoriesMutationResponse(records: CategoriesResponse) {
  nextMutationResponse = cloneCategories(records);
  nextMutationError = null;
}

export function __setCategoriesMutationError(error: unknown) {
  nextMutationError = error;
}

export function __getCategoriesCalls(): string[] {
  return queryCalls.slice();
}

export function __getSaveCategoriesPayloads(): SavePayload[] {
  return mutationCalls.map((entry) => ({
    spreadsheetId: entry.spreadsheetId,
    categories: entry.categories.map((category) => ({ ...category })),
  }));
}

export function __resetCategoriesActionsStub() {
  nextQueryResponse = [];
  nextQueryError = null;
  nextMutationResponse = [];
  nextMutationError = null;
  queryCalls.length = 0;
  mutationCalls.length = 0;
}

export async function getCategories({
  spreadsheetId,
}: {
  spreadsheetId: string;
}): Promise<CategoriesResponse> {
  queryCalls.push(spreadsheetId);

  if (nextQueryError) {
    throw nextQueryError;
  }

  return cloneCategories(nextQueryResponse);
}

export async function saveCategories({
  spreadsheetId,
  categories,
}: {
  spreadsheetId: string;
  categories: CategoryDraft[];
}): Promise<CategoriesResponse> {
  mutationCalls.push({
    spreadsheetId,
    categories: categories.map((item) => ({ ...item })),
  });

  if (nextMutationError) {
    throw nextMutationError;
  }

  const response = cloneCategories(nextMutationResponse);
  nextQueryResponse = cloneCategories(nextMutationResponse);
  return response;
}
