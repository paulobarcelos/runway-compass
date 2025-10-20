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
