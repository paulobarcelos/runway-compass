// ABOUTME: Retrieves authenticated NextAuth session on the server.
// ABOUTME: Redirects visitors to sign-in when no session exists.
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthConfig } from "./config";

export const SIGN_IN_ROUTE = "/auth/sign-in";

type SessionFetcher = typeof getServerSession;

function hasGoogleCredentials(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  return Boolean(clientId && clientSecret);
}

export async function getSession(fetchSession: SessionFetcher = getServerSession) {
  if (!hasGoogleCredentials()) {
    return null;
  }

  return fetchSession(getAuthConfig());
}

export async function requireSession(fetchSession?: SessionFetcher) {
  const session = await getSession(fetchSession);

  if (!session) {
    redirect(SIGN_IN_ROUTE);
  }

  return session;
}
