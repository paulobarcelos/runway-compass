import process from "node:process";

type PermissionLevel = "none" | "read" | "triage" | "write" | "maintain" | "admin";

export interface GitHubPermissionClient {
  getCollaboratorPermissionLevel(
    username: string
  ): Promise<PermissionLevel | "unknown">;
}

export interface GitHubPullRequestInfo {
  head: {
    ref: string;
    sha?: string;
  };
}

export interface GitHubPullRequestClient {
  getPullRequest(number: number): Promise<GitHubPullRequestInfo>;
}

export interface GitHubCommentClient {
  createComment(body: string): Promise<void>;
}

export interface GitHubReactionsClient {
  reactToComment(commentId: number, content: string): Promise<number | undefined>;
  deleteReaction(reactionId: number): Promise<void>;
}

export interface GitHubDeploymentClient {
  createDeployment(input: CreateDeploymentInput): Promise<{ id: number }>;
  setDeploymentStatus(
    deploymentId: number,
    status: DeploymentStatusInput
  ): Promise<void>;
}

export interface GitHubClient
  extends GitHubPermissionClient,
    GitHubCommentClient,
    GitHubPullRequestClient,
    GitHubReactionsClient,
    GitHubDeploymentClient {}

export interface CreateDeploymentInput {
  ref: string;
  environment: string;
  description?: string;
  auto_merge?: boolean;
  required_contexts?: string[];
  transient_environment?: boolean;
  production_environment?: boolean;
}

export interface DeploymentStatusInput {
  state:
    | "error"
    | "failure"
    | "inactive"
    | "in_progress"
    | "pending"
    | "queued"
    | "success";
  log_url?: string;
  environment_url?: string;
}

export interface VercelAliasInfo {
  deploymentId?: string;
  url?: string;
}

export interface VercelDeployment {
  id: string;
  url?: string;
  createdAt?: number;
}

export interface VercelClient {
  getCurrentAlias(domain: string): Promise<VercelAliasInfo | null>;
  getLatestDeploymentForBranch(branch: string): Promise<VercelDeployment | null>;
  setAlias(domain: string, deploymentId: string): Promise<void>;
}

export function isAliasCommand(body: string): boolean {
  return body.trim() === "/alias to staging";
}

const ALLOWED_PERMISSIONS: PermissionLevel[] = ["write", "maintain", "admin"];

export async function checkWriteAccess(
  client: GitHubPermissionClient,
  params: { owner: string; repo: string; username: string }
): Promise<boolean> {
  const level = await client.getCollaboratorPermissionLevel(params.username);
  if (level === "unknown") {
    return false;
  }
  return ALLOWED_PERMISSIONS.includes(level);
}

const WRITE_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR", "MAINTAINER"]);

function hasWriteAssociation(association?: string): boolean {
  if (!association) {
    return false;
  }
  return WRITE_ASSOCIATIONS.has(association.toUpperCase());
}

export async function verifyWriteAccess(
  client: GitHubPermissionClient,
  params: { owner: string; repo: string; username: string; association?: string }
): Promise<boolean> {
  if (hasWriteAssociation(params.association)) {
    return true;
  }

  return checkWriteAccess(client, {
    owner: params.owner,
    repo: params.repo,
    username: params.username,
  });
}

export interface AliasResult {
  deploymentId: string;
  deploymentUrl?: string;
  previousDeploymentId?: string;
}

export class MissingDeploymentError extends Error {
  branch: string;

  constructor(branch: string) {
    super(`No successful Vercel preview deployment found for branch "${branch}".`);
    this.name = "MissingDeploymentError";
    this.branch = branch;
  }
}

export class AliasFailedError extends Error {
  attemptedDeploymentId: string;
  previousDeploymentId?: string;
  rollbackRestored: boolean;
  rollbackError?: unknown;

  constructor(
    attemptedDeploymentId: string,
    message: string,
    options: {
      previousDeploymentId?: string;
      rollbackRestored?: boolean;
      rollbackError?: unknown;
      cause?: unknown;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "AliasFailedError";
    this.attemptedDeploymentId = attemptedDeploymentId;
    this.previousDeploymentId = options.previousDeploymentId;
    this.rollbackRestored = options.rollbackRestored ?? false;
    this.rollbackError = options.rollbackError;
  }
}

export async function aliasLatestPreview(params: {
  branch: string;
  aliasDomain: string;
  vercelClient: VercelClient;
}): Promise<AliasResult> {
  const { branch, aliasDomain, vercelClient } = params;
  const current = await vercelClient.getCurrentAlias(aliasDomain);
  const latest = await vercelClient.getLatestDeploymentForBranch(branch);
  if (!latest) {
    throw new MissingDeploymentError(branch);
  }

  try {
    await vercelClient.setAlias(aliasDomain, latest.id);
    return {
      deploymentId: latest.id,
      deploymentUrl: normalizeDeploymentUrl(latest.url),
      previousDeploymentId: current?.deploymentId,
    };
  } catch (error) {
    let rollbackRestored = false;
    let rollbackError: unknown;
    if (current?.deploymentId) {
      try {
        await vercelClient.setAlias(aliasDomain, current.deploymentId);
        rollbackRestored = true;
      } catch (rollbackFailure) {
        rollbackError = rollbackFailure;
      }
    }

    throw new AliasFailedError(latest.id, getErrorMessage(error), {
      previousDeploymentId: current?.deploymentId,
      rollbackRestored,
      rollbackError,
      cause: error,
    });
  }
}

export interface RunAliasFlowInputs {
  commentBody: string;
  commentAuthor: string;
  commentId: number;
  commentAuthorAssociation?: string;
  issueNumber: number;
  pullNumber: number;
  repoOwner: string;
  repoName: string;
  aliasDomain: string;
  defaultBranch: string;
  workflowRunUrl?: string;
}

export type RunAliasOutcome = "ignored" | "unauthorized" | "success" | "failure";

export async function runAliasFlow(params: {
  github: GitHubClient;
  vercelClient: VercelClient;
  inputs: RunAliasFlowInputs;
}): Promise<RunAliasOutcome> {
  const { github, vercelClient, inputs } = params;

  if (!isAliasCommand(inputs.commentBody)) {
    return "ignored";
  }

  const startReactionId = await attemptAsync(() => github.reactToComment(inputs.commentId, "eyes"));

  const hasAccess = await verifyWriteAccess(github, {
    owner: inputs.repoOwner,
    repo: inputs.repoName,
    username: inputs.commentAuthor,
    association: inputs.commentAuthorAssociation,
  });

  if (!hasAccess) {
    await safeCreateComment(
      github,
      formatFailureComment({
        requestor: inputs.commentAuthor,
        reason: "Only collaborators with at least write access can update the staging alias.",
      })
    );
    await removeStartReaction(github, startReactionId);
    return "unauthorized";
  }

  const prInfo = await github.getPullRequest(inputs.pullNumber);
  const branch = prInfo.head.ref;
  const headRef = prInfo.head.sha ?? prInfo.head.ref;
  const environmentName = "Staging";
  const deploymentDescription = `Updating staging alias to latest preview for ${branch}`;

  let deploymentId: number | undefined;
  try {
    const deployment = await github.createDeployment({
      ref: headRef,
      environment: environmentName,
      description: deploymentDescription,
      auto_merge: false,
      required_contexts: [],
      transient_environment: false,
      production_environment: false,
    });
    deploymentId = deployment.id;

    await github.setDeploymentStatus(
      deploymentId,
      withLogUrl(
        {
          state: "in_progress",
        },
        inputs.workflowRunUrl
      )
    );
  } catch (error) {
    const message = getErrorMessage(error);
    console.error("[alias] failed to create staging deployment:", message);
    await safeCreateComment(
      github,
      formatFailureComment({
        requestor: inputs.commentAuthor,
        reason: `Failed to initialize staging deployment: ${message}`,
      })
    );
    return "failure";
  }

  try {
    const aliasResult = await aliasLatestPreview({
      branch,
      aliasDomain: inputs.aliasDomain,
      vercelClient,
    });

    console.error("[alias] deploying", {
      branch,
      deploymentId: aliasResult.deploymentId,
      deploymentUrl: aliasResult.deploymentUrl,
      previousDeploymentId: aliasResult.previousDeploymentId ?? "(none)",
    });

    await github.setDeploymentStatus(
      deploymentId!,
      withLogUrl(
        {
          state: "success",
          environment_url:
            normalizeDeploymentUrl(inputs.aliasDomain) ?? `https://${inputs.aliasDomain}`,
        },
        inputs.workflowRunUrl
      )
    );

    await safeCreateComment(
      github,
      formatSuccessComment({
        requestor: inputs.commentAuthor,
        aliasDomain: inputs.aliasDomain,
        deploymentUrl: aliasResult.deploymentUrl,
      })
    );

    await removeStartReaction(github, startReactionId);
    await attemptAsync(() => github.reactToComment(inputs.commentId, "rocket"));
    return "success";
  } catch (error) {
    if (deploymentId) {
      await attemptAsync(() =>
        github.setDeploymentStatus(
          deploymentId,
          withLogUrl(
            {
              state: "failure",
            },
            inputs.workflowRunUrl
          )
        )
      );
    }

    const failureMessage = getErrorMessage(error);
    console.error("[alias] staging update failed:", failureMessage);

    if (error instanceof MissingDeploymentError) {
      await safeCreateComment(
        github,
        formatFailureComment({
          requestor: inputs.commentAuthor,
          reason: `No ready Vercel preview deployment found for branch \`${branch}\`. Try redeploying the preview or rerun CI.`,
        })
      );
    } else if (error instanceof AliasFailedError) {
      const details: string[] = [
        `Failed to alias deployment \`${error.attemptedDeploymentId}\`: ${error.message}`,
      ];
      if (error.rollbackRestored) {
        details.push("Rolled back to the previous deployment successfully.");
      } else if (error.previousDeploymentId) {
        details.push(
          `Rollback to previous deployment \`${error.previousDeploymentId}\` failed; please fix manually in Vercel.`
        );
      }

      await safeCreateComment(
        github,
        formatFailureComment({
          requestor: inputs.commentAuthor,
          reason: details.join(" "),
        })
      );
    } else {
      await safeCreateComment(
        github,
        formatFailureComment({
          requestor: inputs.commentAuthor,
          reason: failureMessage,
        })
      );
    }

    await removeStartReaction(github, startReactionId);
    await attemptAsync(() => github.reactToComment(inputs.commentId, "confused"));

    return "failure";
  }
}

async function attemptAsync<T>(action: () => Promise<T>): Promise<T | undefined> {
  try {
    return await action();
  } catch {
    return undefined;
  }
}

async function removeStartReaction(
  github: GitHubReactionsClient,
  reactionId?: number
): Promise<void> {
  if (!reactionId) {
    return;
  }
  await attemptAsync(() => github.deleteReaction(reactionId));
}

async function safeCreateComment(github: GitHubClient, body: string): Promise<void> {
  try {
    await github.createComment(body);
  } catch (error) {
    console.warn("[alias] unable to leave comment:", getErrorMessage(error));
  }
}

function withLogUrl(
  status: DeploymentStatusInput,
  logUrl?: string
): DeploymentStatusInput {
  if (!logUrl) {
    return status;
  }
  return { ...status, log_url: logUrl };
}

function deriveWorkflowRunUrl(): string | undefined {
  const explicit = process.env.WORKFLOW_RUN_URL?.trim();
  if (explicit) {
    return explicit;
  }
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  if (serverUrl && repository && runId) {
    return `${serverUrl}/${repository}/actions/runs/${runId}`;
  }
  return undefined;
}

export function formatFailureComment(params: {
  requestor: string;
  reason: string;
}): string {
  const { requestor, reason } = params;
  return [
    `@${requestor} staging alias update failed ❌`,
    "",
    reason,
    "",
    "Please inspect the workflow logs (Actions tab) and Vercel dashboard for more context.",
  ].join("\n");
}

export function formatSuccessComment(params: {
  requestor: string;
  aliasDomain: string;
  deploymentUrl?: string;
}): string {
  const { requestor, aliasDomain, deploymentUrl } = params;
  const target = deploymentUrl ?? `https://${aliasDomain}`;
  const link = `[${target}](${target})`;
  return [
    `@${requestor} staging alias updated ✅`,
    "",
    `\`${aliasDomain}\` now points to ${link}.`,
    "",
    "Happy testing!",
  ].join("\n");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function normalizeDeploymentUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
}

class RestGitHubClient implements GitHubClient {
  private readonly baseUrl: string;

  constructor(
    private readonly options: {
      token: string;
      owner: string;
      repo: string;
      issueNumber: number;
      pullNumber: number;
    }
  ) {
    this.baseUrl = "https://api.github.com";
  }

  async getCollaboratorPermissionLevel(username: string): Promise<PermissionLevel | "unknown"> {
    const { owner, repo } = this.options;
    const response = await this.request(
      `/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}/permission`,
      { method: "GET" }
    );

    if (response.status === 404) {
      return "none";
    }

    if (!response.ok) {
      return "unknown";
    }

    const payload = (await response.json()) as { permission?: PermissionLevel };
    return payload.permission ?? "unknown";
  }

  async createComment(body: string): Promise<void> {
    const { owner, repo, issueNumber } = this.options;
    const response = await this.request(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to create GitHub comment (${response.status}): ${text || response.statusText}`
      );
    }
  }

  async reactToComment(commentId: number, content: string): Promise<number | undefined> {
    const { owner, repo } = this.options;
    const response = await this.request(
      `/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok && response.status !== 201) {
      const text = await response.text();
      throw new Error(
        `Failed to add reaction (${response.status}): ${text || response.statusText}`
      );
    }

    if (response.status === 204) {
      return undefined;
    }

    try {
      const payload = (await response.json()) as { id?: number };
      return payload?.id;
    } catch {
      return undefined;
    }
  }

  async deleteReaction(reactionId: number): Promise<void> {
    const response = await this.request(`/reactions/${reactionId}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 204) {
      const text = await response.text();
      throw new Error(
        `Failed to remove reaction (${response.status}): ${text || response.statusText}`
      );
    }
  }

  async createDeployment(input: CreateDeploymentInput): Promise<{ id: number }> {
    const { owner, repo } = this.options;
    const response = await this.request(`/repos/${owner}/${repo}/deployments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to create deployment (${response.status}): ${text || response.statusText}`
      );
    }

    const payload = (await response.json()) as { id: number };
    return payload;
  }

  async setDeploymentStatus(
    deploymentId: number,
    status: DeploymentStatusInput
  ): Promise<void> {
    const { owner, repo } = this.options;
    const response = await this.request(
      `/repos/${owner}/${repo}/deployments/${deploymentId}/statuses`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(status),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to update deployment status (${response.status}): ${text || response.statusText}`
      );
    }
  }

  async getPullRequest(number: number): Promise<GitHubPullRequestInfo> {
    const { owner, repo } = this.options;
    const response = await this.request(
      `/repos/${owner}/${repo}/pulls/${number}`,
      { method: "GET" }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to load pull request #${number} (${response.status}): ${text || response.statusText}`
      );
    }

    const payload = (await response.json()) as {
      head: { ref: string; sha?: string };
    };
    return payload;
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.options.token}`,
      "User-Agent": "runway-compass-staging-alias",
    };

    const merged: RequestInit = {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    };

    return fetch(url, merged);
  }
}

class RestVercelClient implements VercelClient {
  constructor(
    private readonly options: {
      token: string;
      projectId: string;
      teamId?: string;
    }
  ) {}

  async getCurrentAlias(domain: string): Promise<VercelAliasInfo | null> {
    const url = this.buildUrl(`/v2/aliases/${domain}`);
    const response = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to resolve current alias (${response.status}): ${text || response.statusText}`
      );
    }

    const data = (await response.json()) as {
      alias?: {
        alias?: string;
        url?: string;
        deploymentId?: string;
        targetDeploymentId?: string;
      };
      aliasId?: string;
      url?: string;
      deploymentId?: string;
      targetDeploymentId?: string;
    };

    // Support both alias-level envelope and top-level payload.
    const source = data.alias ?? data;
    const deploymentId =
      source?.deploymentId ?? source?.targetDeploymentId ?? undefined;
    const urlString =
      source?.url ?? (typeof source?.alias === "string" ? `https://${source.alias}` : undefined);

    return {
      deploymentId,
      url: normalizeDeploymentUrl(urlString),
    };
  }

  async getLatestDeploymentForBranch(branch: string): Promise<VercelDeployment | null> {
    const search = new URLSearchParams({
      projectId: this.options.projectId,
      target: "preview",
      state: "READY",
      limit: "20",
    });

    if (this.options.teamId) {
      search.set("teamId", this.options.teamId);
    }

    const url = `https://api.vercel.com/v6/deployments?${search.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to list Vercel deployments (${response.status}): ${text || response.statusText}`
      );
    }

    const payload = (await response.json()) as {
      deployments?: Array<{
        uid?: string;
        id?: string;
        url?: string;
        createdAt?: number;
        created_at?: number;
        meta?: Record<string, string>;
      }>;
    };
    const deployments = payload.deployments ?? [];

    const matches = deployments
      .filter((deployment) => {
        const meta = deployment.meta ?? {};
        const candidates = [
          meta["githubCommitRef"],
          meta["githubPrHeadBranch"],
          meta["branch"],
        ].filter(Boolean);
        return candidates.includes(branch);
      })
      .sort((a, b) => {
        const aTime = a.createdAt ?? a.created_at ?? 0;
        const bTime = b.createdAt ?? b.created_at ?? 0;
        return bTime - aTime;
      });

    const candidate = matches[0];
    if (!candidate) {
      return null;
    }

    const deploymentId = candidate.uid ?? candidate.id;
    if (!deploymentId) {
      return null;
    }

    return {
      id: deploymentId,
      url: normalizeDeploymentUrl(candidate.url),
      createdAt: candidate.createdAt ?? candidate.created_at,
    };
  }

  async setAlias(domain: string, deploymentId: string): Promise<void> {
    const path = `/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`;
    const body = JSON.stringify({ alias: domain });
    const url = this.buildUrl(path);
    let response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body,
    });

    if (response.status === 404 && this.options.teamId) {
      console.error("[alias] retrying without team scope due to 404");
      // Retry without team scope in case the domain lives in the personal account.
      const fallbackUrl = `https://api.vercel.com${path}`;
      response = await fetch(fallbackUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          "Content-Type": "application/json",
          "User-Agent": "runway-compass-staging-alias",
        },
        body,
      });
    }

    if (response.status === 409) {
      // Alias already points to this deployment; nothing to update.
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to assign alias (${response.status}): ${text || response.statusText}`
      );
    }
  }

  private buildUrl(path: string): string {
    const url = new URL(`https://api.vercel.com${path}`);
    if (this.options.teamId) {
      url.searchParams.set("teamId", this.options.teamId);
    }
    return url.toString();
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.options.token}`,
      "User-Agent": "runway-compass-staging-alias",
    };
  }
}

export { RestVercelClient };

function parseInteger(name: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }
  return parsed;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function run(): Promise<void> {
  const githubToken = requireEnv("GITHUB_TOKEN");
  const issueNumber = parseInteger("ISSUE_NUMBER", process.env.ISSUE_NUMBER);
  const prNumber = parseInteger("PR_NUMBER", process.env.PR_NUMBER);
  const commentId = parseInteger("COMMENT_ID", process.env.COMMENT_ID);
  const repoOwner = requireEnv("REPO_OWNER");
  const repoName = requireEnv("REPO_NAME");
  const commentAuthor = requireEnv("COMMENT_AUTHOR");
  const commentBody = requireEnv("COMMENT_BODY");
  const commentAuthorAssociation = process.env.COMMENT_AUTHOR_ASSOCIATION?.trim() || undefined;
  const aliasDomain = requireEnv("VERCEL_ALIAS_DOMAIN");
  const defaultBranch = requireEnv("DEFAULT_BRANCH");
  const vercelToken = requireEnv("VERCEL_TOKEN");
  const vercelProjectId = requireEnv("VERCEL_PROJECT_ID");
  const vercelTeamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;

  console.error("[alias] config", {
    projectIdPrefix: vercelProjectId.slice(0, 6),
    teamIdPrefix: vercelTeamId ? vercelTeamId.slice(0, 6) : "(none)",
    aliasDomain,
    prNumber,
  });

  const github = new RestGitHubClient({
    token: githubToken,
    owner: repoOwner,
    repo: repoName,
    issueNumber,
    pullNumber: prNumber,
  });
  const vercel = new RestVercelClient({
    token: vercelToken,
    projectId: vercelProjectId,
    teamId: vercelTeamId,
  });

  const outcome = await runAliasFlow({
    github,
    vercelClient: vercel,
    inputs: {
      commentBody,
      commentAuthor,
      commentId,
      commentAuthorAssociation,
      issueNumber,
      pullNumber: prNumber,
      repoOwner,
      repoName,
      aliasDomain,
      defaultBranch,
      workflowRunUrl: deriveWorkflowRunUrl(),
    },
  });

  if (outcome === "failure") {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch((error) => {
    process.exitCode = 1;
    console.error(error);
  });
}
