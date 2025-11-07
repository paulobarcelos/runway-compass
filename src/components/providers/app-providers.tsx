// ABOUTME: Aggregates global client-side providers for the application.
// ABOUTME: Wraps session and base-currency contexts for descendant components.
"use client";

import type { DehydratedState } from "@tanstack/react-query";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

import { AuthSessionProvider } from "@/components/auth/session-provider";
import { BaseCurrencyProvider } from "@/components/currency/base-currency-context";
import { QueryProvider } from "@/components/providers/query-client-provider";

type AppProvidersProps = {
  children: ReactNode;
  dehydratedState?: DehydratedState | null;
  session: Session | null;
};

export function AppProviders({ children, dehydratedState, session }: AppProvidersProps) {
  return (
    <QueryProvider dehydratedState={dehydratedState}>
      <AuthSessionProvider session={session}>
        <BaseCurrencyProvider>{children}</BaseCurrencyProvider>
      </AuthSessionProvider>
    </QueryProvider>
  );
}
