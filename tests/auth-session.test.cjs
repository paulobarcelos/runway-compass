// ABOUTME: Verifies session guard redirects when unauthenticated.
// ABOUTME: Ensures authenticated sessions pass through unchanged.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

test("getSession returns null when credentials missing", async () => {
  const loader = createTestJiti(__filename);
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;

  let fetchCalled = false;

  try {
    const { getSession } = await loader.import("../src/server/auth/session");
    const session = await getSession(async () => {
      fetchCalled = true;
      return { user: { email: "paulo@example.com" } };
    });

    assert.equal(session, null, "null session returned when credentials missing");
    assert.equal(fetchCalled, false, "does not attempt to fetch session");
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("requireSession returns server session when present", async () => {
  const loader = createTestJiti(__filename);
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const mockSession = { user: { email: "paulo@example.com" } };

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { requireSession } = await loader.import("../src/server/auth/session");
    const session = await requireSession(async () => mockSession);

    assert.equal(session, mockSession, "session passthrough");
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("requireSession redirects when session missing", async () => {
  const loader = createTestJiti(__filename);
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  let caught;

  try {
    const { requireSession, SIGN_IN_ROUTE } = await loader.import(
      "../src/server/auth/session",
    );

    try {
      await requireSession(async () => null);
      assert.fail("requireSession should redirect");
    } catch (error) {
      caught = error;
    }

    assert.ok(caught, "redirect error thrown");
    const digest = typeof caught.digest === "string" ? caught.digest : "";
    const redirectTarget = digest.split(";")[2] ?? "";
    assert.equal(redirectTarget, SIGN_IN_ROUTE, "redirects to sign-in page");
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});
