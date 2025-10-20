// ABOUTME: Extends NextAuth session with Google token metadata.
// ABOUTME: Declares JWT fields used for Sheets client authentication.

declare module "next-auth" {
  interface Session {
    googleTokens?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleAccessToken?: string;
    googleRefreshToken?: string;
    googleAccessTokenExpires?: number;
  }
}

export {};
