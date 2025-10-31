/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "commonjs",
  moduleResolution: "node",
  esModuleInterop: true,
  target: "ES2019",
});
require("ts-node/register");

const {
  isAliasCommand,
  checkWriteAccess,
  aliasLatestPreview,
  formatSuccessComment,
  formatFailureComment,
  MissingDeploymentError,
  AliasFailedError,
} = require("../scripts/alias-staging");

test("isAliasCommand returns true only for the exact trigger", () => {
  assert.equal(isAliasCommand("/alias this"), true);
  assert.equal(isAliasCommand(" /alias this "), true);
  assert.equal(isAliasCommand("/ALIAS THIS"), false);
  assert.equal(isAliasCommand("/alias that"), false);
});

test("checkWriteAccess returns true only for write-level permissions", async () => {
  const allowed = ["write", "maintain", "admin"];
  for (const level of allowed) {
    const client = {
      async getCollaboratorPermissionLevel() {
        return level;
      },
    };
    const hasAccess = await checkWriteAccess(client, {
      owner: "runway",
      repo: "compass",
      username: "paulo",
    });
    assert.equal(hasAccess, true);
  }

  const denied = ["read", "triage", "none"];
  for (const level of denied) {
    const client = {
      async getCollaboratorPermissionLevel() {
        return level;
      },
    };
    const hasAccess = await checkWriteAccess(client, {
      owner: "runway",
      repo: "compass",
      username: "guest",
    });
    assert.equal(hasAccess, false);
  }
});

test("aliasLatestPreview returns deployment info and updates alias", async () => {
  const calls = [];
  const vercelClient = {
    async getCurrentAlias(domain) {
      calls.push(["current", domain]);
      return { deploymentId: "dpl_old", url: "https://dpl-old.vercel.app" };
    },
    async getLatestDeploymentForBranch(branch) {
      calls.push(["latest", branch]);
      return {
        id: "dpl_123",
        url: "https://dpl-123.vercel.app",
      };
    },
    async setAlias(domain, deploymentId) {
      calls.push(["set", domain, deploymentId]);
    },
  };

  const result = await aliasLatestPreview({
    branch: "feature/awesome",
    vercelClient,
    aliasDomain: "staging.example.com",
  });

  assert.deepEqual(calls, [
    ["current", "staging.example.com"],
    ["latest", "feature/awesome"],
    ["set", "staging.example.com", "dpl_123"],
  ]);
  assert.equal(result.deploymentId, "dpl_123");
  assert.equal(result.previousDeploymentId, "dpl_old");
  assert.equal(result.deploymentUrl, "https://dpl-123.vercel.app");
});

test("aliasLatestPreview throws MissingDeploymentError if none found", async () => {
  const vercelClient = {
    async getCurrentAlias() {
      return { deploymentId: "dpl_old" };
    },
    async getLatestDeploymentForBranch() {
      return null;
    },
    async setAlias() {
      throw new Error("should not run");
    },
  };

  await assert.rejects(
    () =>
      aliasLatestPreview({
        branch: "feature/missing",
        vercelClient,
        aliasDomain: "staging.example.com",
      }),
    (error) => error instanceof MissingDeploymentError
  );
});

test("aliasLatestPreview rolls back when alias update fails", async () => {
  const calls = [];
  const vercelClient = {
    async getCurrentAlias(domain) {
      calls.push(["current", domain]);
      return { deploymentId: "dpl_old" };
    },
    async getLatestDeploymentForBranch(branch) {
      calls.push(["latest", branch]);
      return { id: "dpl_new", url: "https://dpl-new.vercel.app" };
    },
    async setAlias(domain, deploymentId) {
      calls.push(["set", domain, deploymentId]);
      if (deploymentId === "dpl_new") {
        throw new Error("alias failed");
      }
      return undefined;
    },
  };

  await assert.rejects(
    () =>
      aliasLatestPreview({
        branch: "feature/bad",
        vercelClient,
        aliasDomain: "staging.example.com",
      }),
    (error) => {
      assert.ok(error instanceof AliasFailedError);
      assert.equal(error.rollbackRestored, true);
      return true;
    }
  );

  assert.deepEqual(calls, [
    ["current", "staging.example.com"],
    ["latest", "feature/bad"],
    ["set", "staging.example.com", "dpl_new"],
    ["set", "staging.example.com", "dpl_old"],
  ]);
});

test("formatSuccessComment includes alias and deployment details", () => {
  const message = formatSuccessComment({
    aliasDomain: "staging.runway.test",
    deploymentUrl: "https://deploy.vercel.app",
    requestor: "paulo",
  });
  assert.match(message, /@paulo/);
  assert.match(message, /staging\.runway\.test/);
  assert.match(message, /https:\/\/deploy\.vercel\.app/);
});

test("formatFailureComment highlights reason", () => {
  const message = formatFailureComment({
    requestor: "paulo",
    reason: "No preview deployment found.",
  });
  assert.match(message, /@paulo/);
  assert.match(message, /No preview deployment found/);
});
