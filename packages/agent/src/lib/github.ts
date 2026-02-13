import { Octokit } from "@octokit/rest";
import { getConfig } from "./config.js";

export type IssueInput = {
  title: string;
  body: string;
  labels?: string[];
};

export type IssueResult = {
  created: boolean;
  url?: string;
  reason?: string;
};

export async function createIssue(input: IssueInput): Promise<IssueResult> {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = getConfig();
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return {
      created: false,
      reason: "Missing GitHub configuration",
    };
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const response = await octokit.issues.create({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    title: input.title,
    body: input.body,
    labels: input.labels,
  });

  return {
    created: true,
    url: response.data.html_url,
  };
}
