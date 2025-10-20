// ABOUTME: Wraps React tree with NextAuth session provider.
// ABOUTME: Hydrates client session context for authenticated UI.
"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

export function AuthSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
