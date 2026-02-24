import { describe, expect, it } from "vitest"
import { isValidGitHubRepoUrl, parseGitHubRepoUrl } from "./github-url"

describe("isValidGitHubRepoUrl", () => {
  it("validates full GitHub URLs", () => {
    expect(isValidGitHubRepoUrl("https://github.com/owner/repo")).toBe(true)
    expect(isValidGitHubRepoUrl("https://github.com/owner/repo/")).toBe(true)
    expect(isValidGitHubRepoUrl("https://github.com/vercel/next.js")).toBe(true)
    expect(isValidGitHubRepoUrl("https://github.com/my-org/my_repo")).toBe(true)
  })

  it("validates GitHub URLs without protocol", () => {
    expect(isValidGitHubRepoUrl("github.com/anomalyco/opencode")).toBe(true)
    expect(isValidGitHubRepoUrl("github.com/owner/repo")).toBe(true)
    expect(isValidGitHubRepoUrl("github.com/owner/repo/")).toBe(true)
    expect(isValidGitHubRepoUrl("www.github.com/owner/repo")).toBe(true)
  })

  it("validates shorthand GitHub references", () => {
    expect(isValidGitHubRepoUrl("owner/repo")).toBe(true)
    expect(isValidGitHubRepoUrl("vercel/next.js")).toBe(true)
    expect(isValidGitHubRepoUrl("my-org/my_repo")).toBe(true)
  })

  it("rejects invalid URLs", () => {
    expect(isValidGitHubRepoUrl("")).toBe(false)
    expect(isValidGitHubRepoUrl("https://github.com/owner")).toBe(false)
    expect(isValidGitHubRepoUrl("https://github.com/")).toBe(false)
    expect(isValidGitHubRepoUrl("https://gitlab.com/owner/repo")).toBe(false)
    expect(isValidGitHubRepoUrl("owner")).toBe(false)
    expect(isValidGitHubRepoUrl("/repo")).toBe(false)
  })
})

describe("parseGitHubRepoUrl", () => {
  it("parses full GitHub URLs", () => {
    const result = parseGitHubRepoUrl("https://github.com/owner/repo")
    expect(result).toEqual({
      fullName: "owner/repo",
      owner: "owner",
      repo: "repo",
    })
  })

  it("parses GitHub URLs with trailing slash", () => {
    const result = parseGitHubRepoUrl("https://github.com/owner/repo/")
    expect(result).toEqual({
      fullName: "owner/repo",
      owner: "owner",
      repo: "repo",
    })
  })

  it("parses shorthand GitHub references", () => {
    const result = parseGitHubRepoUrl("owner/repo")
    expect(result).toEqual({
      fullName: "owner/repo",
      owner: "owner",
      repo: "repo",
    })
  })

  it("parses repos with dots and hyphens", () => {
    const result = parseGitHubRepoUrl("vercel/next.js")
    expect(result).toEqual({
      fullName: "vercel/next.js",
      owner: "vercel",
      repo: "next.js",
    })
  })

  it("returns error for invalid URLs", () => {
    const result = parseGitHubRepoUrl("invalid")
    expect(result).toHaveProperty("error")
  })

  it("returns error for URLs without owner/repo", () => {
    const result = parseGitHubRepoUrl("https://github.com/owner")
    expect(result).toHaveProperty("error")
  })

  it("returns error for non-GitHub URLs", () => {
    const result = parseGitHubRepoUrl("https://gitlab.com/owner/repo")
    expect(result).toHaveProperty("error")
  })
})
