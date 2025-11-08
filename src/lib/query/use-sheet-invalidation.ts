"use client";

import { useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "./query-keys";

type SheetInvalidationOptions = {
  refetchOnWindowFocus?: boolean;
  refetchOnVisibility?: boolean;
  disableListeners?: boolean;
};

export function useSheetInvalidation(spreadsheetId?: string, options?: SheetInvalidationOptions) {
  const queryClient = useQueryClient();
  const {
    refetchOnWindowFocus = true,
    refetchOnVisibility = true,
    disableListeners = false,
  } = options ?? {};

  const invalidate = useCallback(() => {
    if (!spreadsheetId) {
      return Promise.resolve();
    }

    return queryClient.invalidateQueries({
      queryKey: queryKeys.sheet(spreadsheetId),
    });
  }, [queryClient, spreadsheetId]);

  useEffect(() => {
    if (
      disableListeners ||
      !spreadsheetId ||
      typeof window === "undefined" ||
      typeof document === "undefined"
    ) {
      return;
    }

    const cleanups: Array<() => void> = [];

    if (refetchOnWindowFocus) {
      const handleFocus = () => {
        void invalidate();
      };
      window.addEventListener("focus", handleFocus);
      cleanups.push(() => window.removeEventListener("focus", handleFocus));
    }

    if (refetchOnVisibility) {
      const handleVisibility = () => {
        if (document.visibilityState === "visible") {
          void invalidate();
        }
      };
      document.addEventListener("visibilitychange", handleVisibility);
      cleanups.push(() => document.removeEventListener("visibilitychange", handleVisibility));
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [disableListeners, invalidate, refetchOnVisibility, refetchOnWindowFocus, spreadsheetId]);

  return { invalidate };
}
