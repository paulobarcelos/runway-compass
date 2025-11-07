// ABOUTME: Wraps TanStack Query mutations with offline-aware queuing support.
"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

interface OfflineMutationQueueResult<TData, TVariables> {
  enqueue: (variables: TVariables) => Promise<TData | null>;
  flush: () => Promise<void>;
  isOnline: boolean;
  pending: number;
}

type QueueEntry<TData, TVariables> = {
  variables: TVariables;
  resolve: (value: TData | null) => void;
  reject: (error: Error) => void;
  promise: Promise<TData | null>;
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject } as const;
}

export function useOfflineMutationQueue<TData, TError, TVariables>(
  mutation: UseMutationResult<TData, TError, TVariables>,
): OfflineMutationQueueResult<TData, TVariables> {
  const queueRef = useRef<Array<QueueEntry<TData, TVariables>>>([]);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const [, forceRender] = useReducer((count) => count + 1, 0);
  const [isOnlineState, setIsOnlineState] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return true;
    }

    return navigator.onLine;
  });
  const isOnlineRef = useRef(isOnlineState);

  const flush = useCallback(async () => {
    if (flushPromiseRef.current) {
      await flushPromiseRef.current;
      return;
    }

    if (!isOnlineRef.current || queueRef.current.length === 0) {
      return;
    }

    const execution = (async () => {
      while (queueRef.current.length > 0 && isOnlineRef.current) {
        const entry = queueRef.current[0];

        try {
          const result = await mutation.mutateAsync(entry.variables);
          queueRef.current.shift();
          forceRender();
          entry.resolve(result ?? null);
        } catch (error) {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            isOnlineRef.current = false;
            setIsOnlineState(false);
            break;
          }

          queueRef.current.shift();
          forceRender();
          const normalized = error instanceof Error ? error : new Error(String(error));
          entry.reject(normalized);
          break;
        }
      }
    })();

    flushPromiseRef.current = execution.finally(() => {
      flushPromiseRef.current = null;
      forceRender();
    });

    await flushPromiseRef.current;
  }, [mutation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleOnline = () => {
      isOnlineRef.current = true;
      setIsOnlineState(true);
      void flush();
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
      setIsOnlineState(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flush]);

  const enqueue = useCallback(
    async (variables: TVariables) => {
      const queueVariables = () => {
        if (queueRef.current.length > 0) {
          const last = queueRef.current[queueRef.current.length - 1];
          last.variables = variables;
          forceRender();
          return last.promise;
        }

        const deferred = createDeferred<TData | null>();
        queueRef.current.push({
          variables,
          resolve: deferred.resolve,
          reject: deferred.reject,
          promise: deferred.promise,
        });
        forceRender();
        return deferred.promise;
      };

      if (!isOnlineRef.current) {
        return queueVariables();
      }

      try {
        const result = await mutation.mutateAsync(variables);
        return result ?? null;
      } catch (error) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          isOnlineRef.current = false;
          setIsOnlineState(false);
          return queueVariables();
        }

        throw error;
      }
    },
    [mutation],
  );

  return {
    get pending() {
      return queueRef.current.length;
    },
    enqueue,
    flush,
    isOnline: isOnlineState,
  };
}
