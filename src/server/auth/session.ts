// ABOUTME: Retrieves authenticated NextAuth session on the server.
// ABOUTME: Redirects visitors to sign-in when no session exists.
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authConfig } from "./config";

export const SIGN_IN_ROUTE = "/auth/sign-in";

type SessionFetcher = typeof getServerSession;

export async function getSession(fetchSession: SessionFetcher = getServerSession) {
  return fetchSession(authConfig);
}

export async function requireSession(fetchSession?: SessionFetcher) {
  const session = await getSession(fetchSession);

  if (!session) {
    redirect(SIGN_IN_ROUTE);
  }

  return session;
}
