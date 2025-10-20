// ABOUTME: Validates NextAuth Google auth configuration.
// ABOUTME: Ensures required scopes and session strategy exist.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("jiti");

const REQUIRED_SCOPE = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

test("authConfig configures Google provider with required scopes", () => {
  const loader = createLoader(__filename, { cache: false });
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { authConfig } = loader("../src/server/auth/config");

    assert.ok(authConfig, "authConfig is exported");
    assert.ok(Array.isArray(authConfig.providers), "providers list defined");

    const googleProvider = authConfig.providers.find(
      (provider) => provider.id === "google",
    );

    assert.ok(googleProvider, "Google provider configured");

    const params =
      googleProvider.options?.authorization?.params ??
      googleProvider.authorization?.params ??
      {};

    assert.equal(params.scope, REQUIRED_SCOPE, "scope includes required values");
    assert.equal(params.access_type, "offline", "offline access requested");
    assert.equal(params.prompt, "consent", "user consent prompt configured");

    assert.equal(authConfig.session?.strategy, "jwt", "JWT session strategy enabled");
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("authConfig jwt callback stores Google tokens", async () => {
  const loader = createLoader(__filename, { cache: false });
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { authConfig } = loader("../src/server/auth/config");

    assert.ok(authConfig.callbacks?.jwt, "jwt callback defined");

    const issuedToken = await authConfig.callbacks.jwt({
      token: {},
      account: {
        provider: "google",
        access_token: "access-123",
        refresh_token: "refresh-456",
        expires_at: 1730000000,
      },
      profile: {},
      user: { email: "paulo@example.com" },
    });

    assert.equal(
      issuedToken.googleAccessToken,
      "access-123",
      "stores access token",
    );
    assert.equal(
      issuedToken.googleRefreshToken,
      "refresh-456",
      "stores refresh token",
    );
    assert.equal(
      issuedToken.googleAccessTokenExpires,
      1730000000,
      "stores expiry",
    );
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("authConfig session callback attaches Google tokens", async () => {
  const loader = createLoader(__filename, { cache: false });
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { authConfig } = loader("../src/server/auth/config");

    assert.ok(authConfig.callbacks?.session, "session callback defined");

    const enrichedSession = await authConfig.callbacks.session({
      session: { user: { email: "paulo@example.com" } },
      token: {
        googleAccessToken: "access-123",
        googleRefreshToken: "refresh-456",
        googleAccessTokenExpires: 1730000000,
      },
    });

    assert.deepEqual(enrichedSession.googleTokens, {
      accessToken: "access-123",
      refreshToken: "refresh-456",
      expiresAt: 1730000000,
    });
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});
