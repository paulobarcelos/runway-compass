// ABOUTME: Exposes NextAuth route handlers for authentication.
// ABOUTME: Connects handlers to shared Google auth configuration.
import NextAuth from "next-auth";

import { authConfig } from "@/server/auth/config";

const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };
