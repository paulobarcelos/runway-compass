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
  formatFailureComment,
  MissingDeploymentError,
  AliasFailedError,
  runAliasFlow,
} = require("../scripts/alias-staging");

test("isAliasCommand returns true only for the exact trigger", () => {
  assert.equal(isAliasCommand("/alias to staging"), true);
  assert.equal(isAliasCommand(" /alias to staging "), true);
  assert.equal(isAliasCommand("/ALIAS TO STAGING"), false);
  assert.equal(isAliasCommand("/alias this"), false);
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

test("formatFailureComment highlights reason", () => {
  const message = formatFailureComment({
    requestor: "paulo",
    reason: "No preview deployment found.",
  });
  assert.match(message, /@paulo/);
  assert.match(message, /No preview deployment found/);
});

test("runAliasFlow reacts, creates deployment, and marks success", async () => {
  const events = [];
  const github = {
    async getCollaboratorPermissionLevel() {
      return "write";
    },
    async reactToComment(commentId, reaction) {
      events.push(["reaction", commentId, reaction]);
    },
    async getPullRequest() {
      return { head: { ref: "feature/awesome" } };
    },
    async createDeployment(input) {
      events.push(["deployment", input]);
      return { id: 101 };
    },
    async setDeploymentStatus(id, status) {
      events.push(["status", id, status]);
    },
    async createComment() {
      events.push(["comment"]);
    },
  };

  const vercelCalls = [];
  const vercelClient = {
    async getCurrentAlias() {
      return { deploymentId: "dpl_old" };
    },
    async getLatestDeploymentForBranch(branch) {
      vercelCalls.push(["latest", branch]);
      return { id: "dpl_123", url: "https://dpl-123.vercel.app" };
    },
    async setAlias(domain, deploymentId) {
      vercelCalls.push(["alias", domain, deploymentId]);
    },
  };

  await runAliasFlow({
    github,
    vercelClient,
    inputs: {
      commentBody: "/alias to staging",
      commentAuthor: "paulo",
      commentId: 77,
      issueNumber: 99,
      pullNumber: 99,
      repoOwner: "paulobarcelos",
      repoName: "runway-compass",
      aliasDomain: "staging.runway.test",
      defaultBranch: "main",
      workflowRunUrl: "https://github.com/example/runs/1",
    },
  });

  assert.deepEqual(events, [
    ["reaction", 77, "+1"],
    [
      "deployment",
      {
        ref: "main",
        environment: "staging",
        description: "Updating staging alias to latest preview for feature/awesome",
        auto_merge: false,
        required_contexts: [],
        transient_environment: false,
        production_environment: false,
      },
    ],
    [
      "status",
      101,
      {
        state: "in_progress",
        log_url: "https://github.com/example/runs/1",
      },
    ],
    [
      "status",
      101,
      {
        state: "success",
        environment_url: "https://staging.runway.test",
        log_url: "https://github.com/example/runs/1",
      },
    ],
  ]);

  assert.deepEqual(vercelCalls, [
    ["latest", "feature/awesome"],
    ["alias", "staging.runway.test", "dpl_123"],
  ]);
});

test("runAliasFlow reports failure and updates deployment status", async () => {
  const events = [];
  const github = {
    async getCollaboratorPermissionLevel() {
      return "write";
    },
    async reactToComment() {
      events.push(["reaction"]);
    },
    async getPullRequest() {
      return { head: { ref: "feature/missing" } };
    },
    async createDeployment() {
      events.push(["deployment"]);
      return { id: 202 };
    },
    async setDeploymentStatus(id, status) {
      events.push(["status", id, status]);
    },
    async createComment(body) {
      events.push(["comment", body]);
    },
  };

  const vercelClient = {
    async getCurrentAlias() {
      return { deploymentId: "dpl_old" };
    },
    async getLatestDeploymentForBranch() {
      return null;
    },
    async setAlias() {
      throw new Error("unexpected");
    },
  };

  await runAliasFlow({
    github,
    vercelClient,
    inputs: {
      commentBody: "/alias to staging",
      commentAuthor: "paulo",
      commentId: 11,
      issueNumber: 99,
      pullNumber: 99,
      repoOwner: "paulobarcelos",
      repoName: "runway-compass",
      aliasDomain: "staging.runway.test",
      defaultBranch: "main",
      workflowRunUrl: "https://github.com/example/runs/2",
    },
  });

  assert.equal(events[0][0], "reaction");
  assert.equal(events[1][0], "deployment");
  assert.deepEqual(events[2], [
    "status",
    202,
    { state: "in_progress", log_url: "https://github.com/example/runs/2" },
  ]);
  assert.deepEqual(events[3], [
    "status",
    202,
    {
      state: "failure",
      log_url: "https://github.com/example/runs/2",
    },
  ]);
  assert.equal(events[4][0], "comment");
  assert.match(events[4][1], /No ready Vercel preview deployment found/);
});
