import { QueryClient, dehydrate } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 2,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchIntervalInBackground: true, // keep background polling alive when tab hidden
      },
      mutations: {
        retry: 3,
      },
    },
  });
}

export { dehydrate };
