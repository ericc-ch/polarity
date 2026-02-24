import { regex } from "arkregex"

const githubUrlRegex = regex(
  "^(?:https://|www\\.)?github\\.com/(?<owner>[a-zA-Z0-9._-]+)/(?<repo>[a-zA-Z0-9._-]+)/?$",
)
const githubShorthandRegex = regex(
  "^(?<owner>[a-zA-Z0-9._-]+)/(?<repo>[a-zA-Z0-9._-]+)$",
)

export function isValidGitHubRepoUrl(url: string): boolean {
  return githubUrlRegex.test(url) || githubShorthandRegex.test(url)
}

export type ParseResult =
  | { fullName: string; owner: string; repo: string }
  | { error: string }

export function parseGitHubRepoUrl(url: string): ParseResult {
  const trimmed = url.trim()

  const httpsMatch = githubUrlRegex.exec(trimmed)
  if (httpsMatch) {
    const owner = httpsMatch.groups?.owner
    const repo = httpsMatch.groups?.repo
    if (owner && repo) {
      return { fullName: `${owner}/${repo}`, owner, repo }
    }
  }

  const shorthandMatch = githubShorthandRegex.exec(trimmed)
  if (shorthandMatch) {
    const owner = shorthandMatch.groups?.owner
    const repo = shorthandMatch.groups?.repo
    if (owner && repo) {
      return { fullName: `${owner}/${repo}`, owner, repo }
    }
  }

  return {
    error:
      "Invalid repository URL. Use format: https://github.com/owner/repo or owner/repo",
  }
}
