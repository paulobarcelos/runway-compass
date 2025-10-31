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

export interface GitHubClient
  extends GitHubPermissionClient,
    GitHubCommentClient,
    GitHubPullRequestClient {}

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
  return body.trim() === "/alias this";
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

export function formatSuccessComment(params: {
  requestor: string;
  aliasDomain: string;
  deploymentUrl?: string;
}): string {
  const { requestor, aliasDomain, deploymentUrl } = params;
  const lines = [
    `@${requestor} staging alias updated ✅`,
    "",
    `- alias: \`${aliasDomain}\``,
  ];

  if (deploymentUrl) {
    lines.push(`- deployment: ${deploymentUrl}`);
  }

  lines.push("", "Feel free to sanity-check the staging site and follow up if anything looks off.");
  return lines.join("\n");
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
    const url = this.buildUrl("/v2/aliases");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        alias: domain,
        deploymentId,
        projectId: this.options.projectId,
      }),
    });

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
  const repoOwner = requireEnv("REPO_OWNER");
  const repoName = requireEnv("REPO_NAME");
  const commentAuthor = requireEnv("COMMENT_AUTHOR");
  const commentBody = requireEnv("COMMENT_BODY");
  const aliasDomain = requireEnv("VERCEL_ALIAS_DOMAIN");
  const vercelToken = requireEnv("VERCEL_TOKEN");
  const vercelProjectId = requireEnv("VERCEL_PROJECT_ID");
  const vercelTeamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;

  if (!isAliasCommand(commentBody)) {
    // Defensive: allow workflow to call script even if guard misfires.
    return;
  }

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

  const hasAccess = await checkWriteAccess(github, {
    owner: repoOwner,
    repo: repoName,
    username: commentAuthor,
  });

  if (!hasAccess) {
    await github.createComment(
      formatFailureComment({
        requestor: commentAuthor,
        reason:
          "Only collaborators with at least write access can update the staging alias.",
      })
    );
    return;
  }

  const prInfo = await github.getPullRequest(prNumber);
  const branch = prInfo.head.ref;

  try {
    const result = await aliasLatestPreview({
      branch,
      aliasDomain,
      vercelClient: vercel,
    });

    await github.createComment(
      formatSuccessComment({
        requestor: commentAuthor,
        aliasDomain,
        deploymentUrl: result.deploymentUrl,
      })
    );
  } catch (error) {
    process.exitCode = 1;

    if (error instanceof MissingDeploymentError) {
      await github.createComment(
        formatFailureComment({
          requestor: commentAuthor,
          reason: `No ready Vercel preview deployment found for branch \`${branch}\`. Try redeploying the preview or rerun CI.`,
        })
      );
      return;
    }

    if (error instanceof AliasFailedError) {
      const details: string[] = [
        `Failed to alias deployment \`${error.attemptedDeploymentId}\`: ${error.message}`,
      ];
      if (error.rollbackRestored === true) {
        details.push("Rolled back to the previous deployment successfully.");
      } else if (error.previousDeploymentId) {
        details.push(
          `Rollback to previous deployment \`${error.previousDeploymentId}\` failed; please fix manually in Vercel.`
        );
      }

      await github.createComment(
        formatFailureComment({
          requestor: commentAuthor,
          reason: details.join(" "),
        })
      );
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unknown error occurred.";

    await github.createComment(
      formatFailureComment({
        requestor: commentAuthor,
        reason: message,
      })
    );
  }
}

if (require.main === module) {
  run().catch((error) => {
    process.exitCode = 1;
    console.error(error);
  });
}
