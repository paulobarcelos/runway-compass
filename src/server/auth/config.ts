// ABOUTME: Provides NextAuth configuration for Google sign-in.
// ABOUTME: Requests required Google Sheets scopes and JWT sessions.
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const REQUIRED_GOOGLE_SCOPE = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";

if (!googleClientId || !googleClientSecret) {
  throw new Error("Missing Google OAuth client credentials");
}

export const authConfig: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      authorization: {
        params: {
          scope: REQUIRED_GOOGLE_SCOPE,
          prompt: "consent",
          access_type: "offline",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
