// ABOUTME: Provides TanStack Query integration for categories manager.
"use client";

import { useMemo } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { formatMutationError, queryKeys } from "@/lib/query";
import {
  buildSerializableCategories,
  normalizeDraftsFromResponse,
  resequenceDrafts,
  type CategoryDraft,
} from "./category-helpers";
import {
  getCategories,
  saveCategories,
} from "@/app/(authenticated)/actions/categories-actions";

interface UseCategoriesResult {
  query: UseQueryResult<CategoryDraft[]>;
  mutation: UseMutationResult<
    CategoryDraft[],
    Error,
    CategoryDraft[],
    { previous?: CategoryDraft[] }
  >;
  mutationError: string | null;
}

export function useCategories(spreadsheetId: string | null): UseCategoriesResult {
  const enabled = typeof spreadsheetId === "string" && spreadsheetId.length > 0;
  const queryClient = useQueryClient();
  const key = enabled ? queryKeys.categories(spreadsheetId!) : ["sheet", "noop", "categories"];

  const query = useQuery<CategoryDraft[]>({
    queryKey: key,
    enabled,
    queryFn: async () => {
      if (!spreadsheetId) {
        return [];
      }

      const records = await getCategories({ spreadsheetId });
      const source = Array.isArray(records)
        ? records
        : Array.isArray((records as { categories?: unknown }).categories)
          ? (records as { categories: unknown[] }).categories
          : [];
      return normalizeDraftsFromResponse(source as Array<Record<string, unknown>>);
    },
  });

  const mutation = useMutation<
    CategoryDraft[],
    Error,
    CategoryDraft[],
    { previous?: CategoryDraft[] }
  >({
    mutationFn: async (drafts: CategoryDraft[]) => {
      if (!spreadsheetId) {
        throw new Error("Missing spreadsheetId");
      }

      const payload = buildSerializableCategories(resequenceDrafts(drafts));
      const result = await saveCategories({
        spreadsheetId,
        categories: payload,
      });

      const records = Array.isArray(result)
        ? result
        : Array.isArray((result as { categories?: unknown }).categories)
          ? (result as { categories: unknown[] }).categories
          : [];

      return normalizeDraftsFromResponse(records as Array<Record<string, unknown>>);
    },
    onMutate: async (drafts) => {
      if (!spreadsheetId) {
        return {};
      }

      const categoriesKey = queryKeys.categories(spreadsheetId);
      await queryClient.cancelQueries({ queryKey: categoriesKey });

      const previous = queryClient.getQueryData<CategoryDraft[]>(categoriesKey);
      queryClient.setQueryData(categoriesKey, resequenceDrafts(drafts));

      return { previous };
    },
    onError: (error, _drafts, context) => {
      if (!spreadsheetId) {
        return;
      }

      const categoriesKey = queryKeys.categories(spreadsheetId);
      if (context?.previous) {
        queryClient.setQueryData(categoriesKey, context.previous);
      }

      console.error("Category mutation failed", error);
    },
    onSuccess: (nextDrafts) => {
      if (!spreadsheetId) {
        return;
      }

      const categoriesKey = queryKeys.categories(spreadsheetId);
      queryClient.setQueryData(categoriesKey, nextDrafts);
    },
  });

  const mutationError = useMemo(() => {
    if (mutation.isError) {
      return formatMutationError(mutation.error);
    }
    return null;
  }, [mutation.error, mutation.isError]);

  return { query, mutation, mutationError };
}
