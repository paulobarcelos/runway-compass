// ABOUTME: Confirms NextAuth route exports configured handlers.
// ABOUTME: Ensures route composes NextAuth with project config.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createTestJiti } = require("./helpers/create-jiti");

test("auth route wires NextAuth with shared config", async () => {
  const stubPath = path.resolve(__dirname, "./fixtures/next-auth-stub.cjs");
  const googleProviderPath = require.resolve("next-auth/providers/google");
  const jiti = createTestJiti(__filename, {
    alias: {
      "next-auth": stubPath,
      "next-auth/providers/google": googleProviderPath,
    },
  });
  const nextAuthStub = require("./fixtures/next-auth-stub.cjs");
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const originalSecret = process.env.NEXTAUTH_SECRET;

  const handlerResponse = Symbol("next-auth-handler");
  global.__NEXT_AUTH_HANDLER__ = () => handlerResponse;
  nextAuthStub.__reset();

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret";

  try {
    const routeModule = await jiti.import(
      "../src/app/api/auth/[...nextauth]/route",
    );
    const { getAuthConfig } = await jiti.import("../src/server/auth/config");
    const authConfig = getAuthConfig();

    assert.equal(typeof routeModule.GET, "function", "GET handler exported");
    assert.equal(routeModule.GET, routeModule.POST, "GET and POST share handler");
    assert.equal(
      nextAuthStub.__getLastOptions(),
      undefined,
      "NextAuth not invoked until handler executes",
    );

    const result = routeModule.GET();

    assert.equal(result, handlerResponse, "Handler delegates to stub");

    const receivedOptions = nextAuthStub.__getLastOptions();
    assert.ok(receivedOptions, "NextAuth invoked with config");

    const receivedProvider = receivedOptions?.providers?.find(
      (provider) => provider.id === "google",
    );
    const expectedProvider = authConfig.providers.find(
      (provider) => provider.id === "google",
    );

    assert.ok(receivedProvider, "Google provider forwarded");
    assert.ok(expectedProvider, "Expected provider resolved");
    assert.deepEqual(
      receivedProvider?.options?.authorization?.params,
      expectedProvider?.options?.authorization?.params,
      "Provider scope and prompts forwarded",
    );
    assert.equal(
      receivedOptions?.session?.strategy,
      authConfig.session?.strategy,
      "Session strategy forwarded",
    );
    assert.equal(
      nextAuthStub.__getLastHandler(),
      global.__NEXT_AUTH_HANDLER__,
      "Memoized handler returned from NextAuth stub",
    );
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    process.env.NEXTAUTH_SECRET = originalSecret;
    nextAuthStub.__reset();
    delete global.__NEXT_AUTH_HANDLER__;
  }
});
