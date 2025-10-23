// ABOUTME: Exposes NextAuth route handlers for authentication.
// ABOUTME: Connects handlers to shared Google auth configuration.
import NextAuth from "next-auth";

import { getAuthConfig } from "@/server/auth/config";

type Handler = ReturnType<typeof NextAuth>;

let cachedHandler: Handler | null = null;

function ensureHandler(): Handler {
  if (!cachedHandler) {
    cachedHandler = NextAuth(getAuthConfig());
  }

  return cachedHandler;
}

const handler = (...args: Parameters<Handler>): ReturnType<Handler> =>
  ensureHandler()(...args);

export { handler as GET, handler as POST };
