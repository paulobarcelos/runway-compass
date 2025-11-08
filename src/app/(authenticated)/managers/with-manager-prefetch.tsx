import { ReactNode, isValidElement } from "react";
import type { QueryClient } from "@tanstack/react-query";

const MANAGER_PREFETCH_SYMBOL = Symbol.for("runway.manager.prefetch");

type ManagerPrefetchArgs = {
  queryClient: QueryClient;
  spreadsheetId: string;
};

export type ManagerPrefetchFn = (args: ManagerPrefetchArgs) => Promise<void> | void;

type ServerComponent<P> = (props: P) => ReactNode | Promise<ReactNode>;

type PrefetchableComponent<P> = ServerComponent<P> & {
  [MANAGER_PREFETCH_SYMBOL]?: ManagerPrefetchFn | null;
  displayName?: string;
};

export function withManagerPrefetch<P>(
  Component: ServerComponent<P>,
  prefetch?: ManagerPrefetchFn | null,
): PrefetchableComponent<P> {
  const Wrapped: PrefetchableComponent<P> = async function ManagerPrefetchWrapper(props: P) {
    return Component(props);
  };

  Wrapped.displayName = Component.name || "ManagerPage";
  Wrapped[MANAGER_PREFETCH_SYMBOL] = prefetch ?? null;

  return Wrapped;
}

export function extractManagerPrefetch(node: ReactNode): ManagerPrefetchFn | null {
  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const child of node) {
      const prefetch = extractManagerPrefetch(child);
      if (prefetch) {
        return prefetch;
      }
    }
    return null;
  }

  if (isValidElement(node)) {
    const type = node.type as PrefetchableComponent<unknown>;
    if (type && type[MANAGER_PREFETCH_SYMBOL]) {
      return type[MANAGER_PREFETCH_SYMBOL] ?? null;
    }

    // Fragments or other wrappers may hold nested children.
    const elementProps = (node as { props?: { children?: ReactNode } }).props;
    if (elementProps?.children) {
      return extractManagerPrefetch(elementProps.children);
    }
  }

  return null;
}
