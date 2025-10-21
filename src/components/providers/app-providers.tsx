// ABOUTME: Aggregates global client-side providers for the application.
// ABOUTME: Wraps session and base-currency contexts for descendant components.
"use client";

import type { Session } from "next-auth";

import { AuthSessionProvider } from "@/components/auth/session-provider";
import { BaseCurrencyProvider } from "@/components/currency/base-currency-context";

export function AppProviders({
  session,
  children,
}: {
  session: Session | null;
  children: React.ReactNode;
}) {
  return (
    <AuthSessionProvider session={session}>
      <BaseCurrencyProvider>{children}</BaseCurrencyProvider>
    </AuthSessionProvider>
  );
}
