import { describe, expect, it, vi, afterEach } from "vitest";

const mockIssueCreate = vi.fn();
const mockCommentCreate = vi.fn();
const mockPullsCreate = vi.fn();
const mockAddLabels = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    issues = {
      create: mockIssueCreate,
      createComment: mockCommentCreate,
      addLabels: mockAddLabels,
    };
    pulls = { create: mockPullsCreate };
  },
}));

vi.mock("./config.js", () => ({ getConfig: vi.fn() }));
vi.mock("./repoTarget.js", () => ({ resolveRepoTarget: vi.fn() }));
vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createIssue, createIssueComment, createPullRequest } from "./github.js";
import { getConfig } from "./config.js";
import { resolveRepoTarget } from "./repoTarget.js";

function withTarget() {
  vi.mocked(getConfig).mockReturnValue({ GITHUB_TOKEN: "tok" } as any);
  vi.mocked(resolveRepoTarget).mockReturnValue({
    owner: "owner",
    repo: "repo",
    host: "github.com",
    repoKey: "owner/repo",
  });
}

afterEach(() => vi.clearAllMocks());

describe("createIssue", () => {
  it("creates issue and returns url + number", async () => {
    withTarget();
    mockIssueCreate.mockResolvedValue({
      data: { html_url: "https://github.com/o/r/issues/1", number: 1 },
    });
    const result = await createIssue({ title: "Bug", body: "desc" });
    expect(result).toEqual({
      created: true,
      url: "https://github.com/o/r/issues/1",
      number: 1,
    });
  });

  it("returns created:false when GITHUB_TOKEN is missing", async () => {
    vi.mocked(getConfig).mockReturnValue({ GITHUB_TOKEN: undefined } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue({
      owner: "o",
      repo: "r",
      host: "github.com",
      repoKey: "o/r",
    });
    const result = await createIssue({ title: "T", body: "B" });
    expect(result.created).toBe(false);
    expect(result.reason).toContain("Missing");
  });

  it("returns created:false when target is null", async () => {
    vi.mocked(getConfig).mockReturnValue({ GITHUB_TOKEN: "tok" } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(null);
    const result = await createIssue({ title: "T", body: "B" });
    expect(result.created).toBe(false);
  });

  it("returns created:false and reason on Octokit error", async () => {
    withTarget();
    mockIssueCreate.mockRejectedValue(new Error("rate limited"));
    const result = await createIssue({ title: "T", body: "B" });
    expect(result.created).toBe(false);
    expect(result.reason).toContain("rate limited");
  });
});

describe("createIssueComment", () => {
  it("posts comment and returns url", async () => {
    withTarget();
    mockCommentCreate.mockResolvedValue({
      data: { html_url: "https://github.com/o/r/issues/1#comment-1" },
    });
    const result = await createIssueComment(1, "looks good");
    expect(result).toEqual({
      created: true,
      url: "https://github.com/o/r/issues/1#comment-1",
    });
  });

  it("returns created:false when token missing", async () => {
    vi.mocked(getConfig).mockReturnValue({ GITHUB_TOKEN: undefined } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(null);
    const result = await createIssueComment(1, "body");
    expect(result.created).toBe(false);
  });

  it("returns created:false on Octokit error", async () => {
    withTarget();
    mockCommentCreate.mockRejectedValue(new Error("403 Forbidden"));
    const result = await createIssueComment(1, "body");
    expect(result.created).toBe(false);
    expect(result.reason).toContain("403");
  });
});

describe("createPullRequest", () => {
  it("creates PR, adds labels, returns url", async () => {
    withTarget();
    mockPullsCreate.mockResolvedValue({
      data: { html_url: "https://github.com/o/r/pull/2", number: 2 },
    });
    mockAddLabels.mockResolvedValue({});
    const result = await createPullRequest({
      title: "fix",
      body: "body",
      head: "branch",
      base: "main",
      labels: ["autofix"],
    });
    expect(result).toEqual({ created: true, url: "https://github.com/o/r/pull/2" });
    expect(mockAddLabels).toHaveBeenCalled();
  });

  it("succeeds even when addLabels throws", async () => {
    withTarget();
    mockPullsCreate.mockResolvedValue({
      data: { html_url: "https://github.com/o/r/pull/2", number: 2 },
    });
    mockAddLabels.mockRejectedValue(new Error("label error"));
    const result = await createPullRequest({
      title: "fix",
      body: "b",
      head: "branch",
      base: "main",
      labels: ["autofix"],
    });
    expect(result.created).toBe(true);
  });

  it("skips addLabels when no labels provided", async () => {
    withTarget();
    mockPullsCreate.mockResolvedValue({
      data: { html_url: "https://github.com/o/r/pull/2", number: 2 },
    });
    await createPullRequest({ title: "f", body: "b", head: "h", base: "main" });
    expect(mockAddLabels).not.toHaveBeenCalled();
  });

  it("returns created:false on Octokit error", async () => {
    withTarget();
    mockPullsCreate.mockRejectedValue(new Error("auth error"));
    const result = await createPullRequest({
      title: "f",
      body: "b",
      head: "h",
      base: "main",
    });
    expect(result.created).toBe(false);
    expect(result.reason).toContain("auth error");
  });

  it("returns created:false when no token", async () => {
    vi.mocked(getConfig).mockReturnValue({ GITHUB_TOKEN: undefined } as any);
    vi.mocked(resolveRepoTarget).mockReturnValue(null);
    const result = await createPullRequest({
      title: "f",
      body: "b",
      head: "h",
      base: "main",
    });
    expect(result.created).toBe(false);
  });
});
