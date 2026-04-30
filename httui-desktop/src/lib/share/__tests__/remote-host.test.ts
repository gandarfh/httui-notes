import { describe, expect, it } from "vitest";

import { parseRemoteUrl } from "../remote-host";

describe("parseRemoteUrl", () => {
  it("parses ssh GitHub with .git suffix", () => {
    const p = parseRemoteUrl("git@github.com:owner/repo.git");
    expect(p?.host).toEqual({ kind: "github" });
    expect(p?.owner).toBe("owner");
    expect(p?.repo).toBe("repo");
    expect(p?.hostStr).toBe("github.com");
  });

  it("parses ssh GitHub without .git suffix", () => {
    const p = parseRemoteUrl("git@github.com:owner/repo");
    expect(p?.repo).toBe("repo");
  });

  it("parses https GitHub", () => {
    const p = parseRemoteUrl("https://github.com/acme/widgets.git");
    expect(p?.host).toEqual({ kind: "github" });
    expect(p?.owner).toBe("acme");
    expect(p?.repo).toBe("widgets");
  });

  it("parses gitlab.com", () => {
    const p = parseRemoteUrl("https://gitlab.com/group/repo.git");
    expect(p?.host).toEqual({ kind: "gitlab" });
  });

  it("parses self-hosted GitLab via gitlab. prefix", () => {
    const p = parseRemoteUrl("git@gitlab.example.com:group/repo.git");
    expect(p?.host).toEqual({
      kind: "gitlab_self_hosted",
      host: "gitlab.example.com",
    });
  });

  it("parses bitbucket.org", () => {
    const p = parseRemoteUrl("git@bitbucket.org:team/repo.git");
    expect(p?.host).toEqual({ kind: "bitbucket" });
  });

  it("parses gitea.com", () => {
    const p = parseRemoteUrl("https://gitea.com/owner/repo.git");
    expect(p?.host).toEqual({ kind: "gitea" });
  });

  it("parses self-hosted Gitea via gitea. prefix", () => {
    const p = parseRemoteUrl("https://gitea.internal.example.com/owner/repo");
    expect(p?.host).toEqual({ kind: "gitea" });
  });

  it("classifies unknown hosts as other", () => {
    const p = parseRemoteUrl("https://code.example.com/owner/repo");
    expect(p?.host).toEqual({ kind: "other", host: "code.example.com" });
  });

  it("nested gitlab groups: owner = first segment, repo = last segment", () => {
    const p = parseRemoteUrl("https://gitlab.com/group/sub/repo.git");
    expect(p?.owner).toBe("group");
    expect(p?.repo).toBe("repo");
  });

  it("strips user@ and :port from the host", () => {
    const p = parseRemoteUrl("https://user@github.com:443/owner/repo.git");
    expect(p?.host).toEqual({ kind: "github" });
    expect(p?.hostStr).toBe("github.com");
  });

  it("supports ssh:// scheme", () => {
    const p = parseRemoteUrl("ssh://git@gitlab.com/group/repo.git");
    expect(p?.host).toEqual({ kind: "gitlab" });
  });

  it("supports git:// scheme", () => {
    const p = parseRemoteUrl("git://github.com/owner/repo.git");
    expect(p?.host).toEqual({ kind: "github" });
  });

  it("classification is case-insensitive but hostStr preserves casing", () => {
    const p = parseRemoteUrl("git@GitHub.com:owner/repo.git");
    expect(p?.host).toEqual({ kind: "github" });
    expect(p?.hostStr).toBe("GitHub.com");
  });

  it("returns null for empty / whitespace input", () => {
    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl("   ")).toBeNull();
  });

  it("returns null for unknown schemes", () => {
    expect(parseRemoteUrl("ftp://example.com/owner/repo")).toBeNull();
  });

  it("returns null when path is missing the second segment", () => {
    expect(parseRemoteUrl("https://github.com/owner")).toBeNull();
    expect(parseRemoteUrl("git@github.com:owner")).toBeNull();
  });

  it("tolerates trailing slashes", () => {
    const p = parseRemoteUrl("https://github.com/owner/repo/");
    expect(p?.repo).toBe("repo");
  });

  it("preserves the original URL", () => {
    const url = "git@github.com:owner/repo.git";
    expect(parseRemoteUrl(url)?.original).toBe(url);
  });
});
