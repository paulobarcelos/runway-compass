// ABOUTME: Confirms NextAuth route exports configured handlers.
// ABOUTME: Ensures route composes NextAuth with project config.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("jiti");

test("auth route wires NextAuth with shared config", () => {
  const loader = createLoader(__filename, { cache: false });
  const nextAuthPath = require.resolve("next-auth");
  const originalModule = require.cache[nextAuthPath];
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const originalSecret = process.env.NEXTAUTH_SECRET;

  const handlerResponse = Symbol("next-auth-handler");
  let receivedOptions;

  const handler = () => handlerResponse;
  const stub = (options) => {
    receivedOptions = options;
    return handler;
  };
  stub.default = stub;

  require.cache[nextAuthPath] = { exports: stub };

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.NEXTAUTH_SECRET = "test-nextauth-secret";

  try {
    const routeModule = loader("../src/app/api/auth/[...nextauth]/route");
    const { authConfig } = loader("../src/server/auth/config");

    assert.equal(typeof routeModule.GET, "function", "GET handler exported");
    assert.equal(routeModule.GET, routeModule.POST, "GET and POST share handler");
    assert.equal(receivedOptions, authConfig, "NextAuth receives shared config");
    assert.equal(routeModule.GET(), handlerResponse, "Handler delegates to stub");
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    process.env.NEXTAUTH_SECRET = originalSecret;

    if (originalModule) {
      require.cache[nextAuthPath] = originalModule;
    } else {
      delete require.cache[nextAuthPath];
    }
  }
});
