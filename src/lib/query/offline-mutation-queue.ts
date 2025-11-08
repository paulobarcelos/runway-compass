// ABOUTME: Wraps TanStack Query mutations with offline-aware queuing support.
"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { UseMutationResult } from "@tanstack/react-query";

export type OfflineMutationQueueState = "idle" | "processing" | "queued" | "offline";

interface OfflineMutationQueueResult<TData, TVariables> {
  enqueue: (variables: TVariables) => Promise<TData | null>;
  flush: () => Promise<void>;
  reset: () => void;
  isOnline: boolean;
  pending: number;
  state: OfflineMutationQueueState;
}

type OfflineMutationQueueOptions = {
  onReconnect?: () => void;
  reconnectDelayMs?: number;
  resetKey?: unknown;
};

type QueueEntry<TData, TVariables> = {
  variables: TVariables;
  resolve: (value: TData | null) => void;
  reject: (error: Error) => void;
  promise: Promise<TData | null>;
};

type TimeoutHandle = ReturnType<typeof setTimeout> | number;

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
  options?: OfflineMutationQueueOptions,
): OfflineMutationQueueResult<TData, TVariables> {
  const queueRef = useRef<Array<QueueEntry<TData, TVariables>>>([]);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const reconnectTimeoutRef = useRef<TimeoutHandle | null>(null);
  const [, forceRender] = useReducer((count) => count + 1, 0);
  const initialOnline =
    typeof window === "undefined" || typeof navigator === "undefined"
      ? true
      : navigator.onLine;
  const [isOnlineState, setIsOnlineState] = useState<boolean>(initialOnline);
  const [queueState, setQueueState] = useState<OfflineMutationQueueState>(
    initialOnline ? "idle" : "offline",
  );
  const isOnlineRef = useRef(initialOnline);
  const processingRef = useRef(false);

  const updateState = useCallback(() => {
    setQueueState((current) => {
      let next: OfflineMutationQueueState = "idle";

      if (!isOnlineRef.current) {
        next = "offline";
      } else if (processingRef.current) {
        next = "processing";
      } else if (queueRef.current.length > 0) {
        next = "queued";
      }

      return current === next ? current : next;
    });
  }, []);

  const setProcessing = useCallback(
    (value: boolean) => {
      if (processingRef.current === value) {
        return;
      }
      processingRef.current = value;
      updateState();
    },
    [updateState],
  );

  const flush = useCallback(async () => {
    if (flushPromiseRef.current) {
      await flushPromiseRef.current;
      return;
    }

    if (!isOnlineRef.current || queueRef.current.length === 0) {
      return;
    }

    const execution = (async () => {
      setProcessing(true);
      try {
        while (queueRef.current.length > 0 && isOnlineRef.current) {
        const entry = queueRef.current[0];

        try {
          const result = await mutation.mutateAsync(entry.variables);
          queueRef.current.shift();
          forceRender();
          updateState();
          entry.resolve(result ?? null);
        } catch (error) {
          if (typeof navigator !== "undefined" && !navigator.onLine) {
            isOnlineRef.current = false;
            setIsOnlineState(false);
            updateState();
            break;
          }

          queueRef.current.shift();
          forceRender();
          updateState();
          const normalized = error instanceof Error ? error : new Error(String(error));
          entry.reject(normalized);
          break;
        }
      }
      } finally {
        setProcessing(false);
      }
    })();

    flushPromiseRef.current = execution.finally(() => {
      flushPromiseRef.current = null;
      forceRender();
    });

    await flushPromiseRef.current;
  }, [mutation, setProcessing, updateState]);

  const reconnectDelay = options?.reconnectDelayMs ?? 500;
  const onReconnect = options?.onReconnect;
  const resetKey = options?.resetKey ?? null;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      clearTimeout(reconnectTimeoutRef.current as ReturnType<typeof setTimeout>);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const resetQueue = useCallback(() => {
    if (queueRef.current.length > 0) {
      queueRef.current = [];
      forceRender();
    }

    setProcessing(false);
    updateState();
    clearReconnectTimer();
  }, [clearReconnectTimer, forceRender, setProcessing, updateState]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleReconnectFlush = () => {
      clearReconnectTimer();
      reconnectTimeoutRef.current = window.setTimeout(async () => {
        reconnectTimeoutRef.current = null;
        await flush();
        if (isOnlineRef.current) {
          onReconnect?.();
        }
      }, reconnectDelay);
    };

    const handleOnline = () => {
      isOnlineRef.current = true;
      setIsOnlineState(true);
      updateState();
      handleReconnectFlush();
    };

    const handleOffline = () => {
      clearReconnectTimer();
      isOnlineRef.current = false;
      setIsOnlineState(false);
      setProcessing(false);
      updateState();
    };

    window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      return () => {
        window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearReconnectTimer();
    };
  }, [clearReconnectTimer, flush, onReconnect, reconnectDelay, setProcessing, updateState]);

  useEffect(() => {
    resetQueue();
  }, [resetKey, resetQueue]);

  const enqueue = useCallback(
    async (variables: TVariables) => {
      const queueVariables = () => {
        if (queueRef.current.length > 0) {
          const last = queueRef.current[queueRef.current.length - 1];
          last.variables = variables;
          forceRender();
          updateState();
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
        updateState();
        return deferred.promise;
      };

      if (!isOnlineRef.current) {
        return queueVariables();
      }

      try {
        setProcessing(true);
        const result = await mutation.mutateAsync(variables);
        return result ?? null;
      } catch (error) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          isOnlineRef.current = false;
          setIsOnlineState(false);
          updateState();
          return queueVariables();
        }

        throw error;
      } finally {
        setProcessing(false);
      }
    },
    [mutation, setProcessing, updateState],
  );

  return {
    get pending() {
      return queueRef.current.length;
    },
    enqueue,
    flush,
    reset: resetQueue,
    isOnline: isOnlineState,
    state: queueState,
  };
}
