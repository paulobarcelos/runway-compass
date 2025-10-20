// ABOUTME: Confirms NextAuth route exports configured handlers.
// ABOUTME: Ensures route composes NextAuth with project config.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createJiti } = require("jiti");

test("auth route wires NextAuth with shared config", async () => {
  const stubPath = path.resolve(__dirname, "./fixtures/next-auth-stub.cjs");
  const googleProviderPath = require.resolve("next-auth/providers/google");
  const jiti = createJiti(__filename, {
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
    const { authConfig } = await jiti.import("../src/server/auth/config");

    assert.equal(typeof routeModule.GET, "function", "GET handler exported");
    assert.equal(routeModule.GET, routeModule.POST, "GET and POST share handler");
    assert.equal(
      routeModule.GET,
      nextAuthStub.__getLastHandler(),
      "Handler returned from NextAuth stub",
    );
    const receivedOptions = nextAuthStub.__getLastOptions();
    assert.ok(receivedOptions, "NextAuth invoked with config");
    assert.deepEqual(
      receivedOptions?.providers,
      authConfig.providers,
      "Providers list forwarded",
    );
    assert.equal(
      receivedOptions?.session?.strategy,
      authConfig.session?.strategy,
      "Session strategy forwarded",
    );
    assert.equal(routeModule.GET(), handlerResponse, "Handler delegates to stub");
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    process.env.NEXTAUTH_SECRET = originalSecret;
    nextAuthStub.__reset();
    delete global.__NEXT_AUTH_HANDLER__;
  }
});
