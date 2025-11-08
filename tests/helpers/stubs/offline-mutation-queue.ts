// ABOUTME: Simplified offline mutation queue stub for hook tests.
import type { UseMutationResult } from "@tanstack/react-query";

export function useOfflineMutationQueue<TData, TError, TVariables>(
  mutation: UseMutationResult<TData, TError, TVariables>,
) {
  return {
    enqueue: async (variables: TVariables) => mutation.mutateAsync(variables),
    flush: async () => {},
    reset: () => {},
    get isOnline() {
      return true;
    },
    get pending() {
      return mutation.isPending ? 1 : 0;
    },
    get state() {
      return mutation.isPending ? "processing" : "idle";
    },
  } as const;
}
