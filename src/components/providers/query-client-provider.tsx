"use client";

import {
  HydrationBoundary,
  QueryClientProvider,
  type DehydratedState,
} from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { createQueryClient } from "@/lib/query";

type QueryProviderProps = {
  children: ReactNode;
  dehydratedState?: DehydratedState | null;
};

export function QueryProvider({ children, dehydratedState }: QueryProviderProps) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
    </QueryClientProvider>
  );
}
