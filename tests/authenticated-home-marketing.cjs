/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

test("authenticated home has no marketing copy", () => {
  const pagePath = path.join(__dirname, "../src/app/page.tsx");
  const page = readFileSync(pagePath, "utf8");

  const bannedPhrases = [
    "Personal runway planning",
    "Keep your 24-month cash runway clear",
    "Runway Compass helps you connect a private Google Sheet",
    "Milestone 1 will introduce Google sign-in",
  ];

  for (const phrase of bannedPhrases) {
    assert.ok(
      !page.includes(phrase),
      `Expected marketing phrase to be removed: ${phrase}`,
    );
  }
});
