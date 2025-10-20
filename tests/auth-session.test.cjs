// ABOUTME: Verifies session guard redirects when unauthenticated.
// ABOUTME: Ensures authenticated sessions pass through unchanged.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

test("requireSession returns server session when present", async () => {
  const loader = createJiti(__filename, { cache: false });
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const mockSession = { user: { email: "paulo@example.com" } };

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { requireSession } = loader("../src/server/auth/session");
    const session = await requireSession(async () => mockSession);

    assert.equal(session, mockSession, "session passthrough");
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("requireSession redirects when session missing", async () => {
  const loader = createJiti(__filename, { cache: false });
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  let caught;

  try {
    const { requireSession, SIGN_IN_ROUTE } = loader(
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
