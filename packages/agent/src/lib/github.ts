import { Octokit } from "@octokit/rest";
import { getConfig } from "./config.js";
import { resolveRepoTarget } from "./repoTarget.js";

export type IssueInput = {
  title: string;
  body: string;
  labels?: string[];
};

export type IssueResult = {
  created: boolean;
  url?: string;
  number?: number;
  reason?: string;
};

export async function createIssue(input: IssueInput): Promise<IssueResult> {
  const { GITHUB_TOKEN } = getConfig();
  const target = resolveRepoTarget();
  if (!GITHUB_TOKEN || !target) {
    return {
      created: false,
      reason: "Missing GitHub configuration",
    };
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const response = await octokit.issues.create({
    owner: target.owner,
    repo: target.repo,
    title: input.title,
    body: input.body,
    labels: input.labels,
  });

  return {
    created: true,
    url: response.data.html_url,
    number: response.data.number,
  };
}

export async function createIssueComment(
  issueNumber: number,
  body: string
): Promise<{ created: boolean; url?: string; reason?: string }> {
  const { GITHUB_TOKEN } = getConfig();
  const target = resolveRepoTarget();
  if (!GITHUB_TOKEN || !target) {
    return { created: false, reason: "Missing GitHub configuration" };
  }
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const response = await octokit.issues.createComment({
    owner: target.owner,
    repo: target.repo,
    issue_number: issueNumber,
    body,
  });
  return { created: true, url: response.data.html_url };
}

export async function createPullRequest(input: {
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
  labels?: string[];
}): Promise<{ created: boolean; url?: string; reason?: string }> {
  const { GITHUB_TOKEN } = getConfig();
  const target = resolveRepoTarget();
  if (!GITHUB_TOKEN || !target) {
    return { created: false, reason: "Missing GitHub configuration" };
  }
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const response = await octokit.pulls.create({
    owner: target.owner,
    repo: target.repo,
    title: input.title,
    body: input.body,
    head: input.head,
    base: input.base,
    draft: input.draft ?? false,
  });

  if (input.labels && input.labels.length > 0) {
    try {
      await octokit.issues.addLabels({
        owner: target.owner,
        repo: target.repo,
        issue_number: response.data.number,
        labels: input.labels,
      });
    } catch {
      // Ignore label failures to avoid blocking PR creation.
    }
  }

  return { created: true, url: response.data.html_url };
}
