import { describe, expect, it } from "vitest"
import type { Issue, PullRequest } from "../routes/repositories/queries.js"
import { prepIssue, prepPullRequest } from "./embedding.js"

describe("prepIssue", () => {
  it("combines title and body with newline separator", () => {
    const issue: Issue = {
      id: "I_123",
      number: 42,
      title: "Fix login bug",
      bodyText: "Users cannot log in with OAuth.",
      state: "OPEN",
    }

    const result = prepIssue(issue)

    expect(result).toBe("Fix login bug\n\nUsers cannot log in with OAuth.")
  })

  it("handles empty body text", () => {
    const issue: Issue = {
      id: "I_124",
      number: 43,
      title: "Update README",
      bodyText: "",
      state: "CLOSED",
    }

    const result = prepIssue(issue)

    expect(result).toBe("Update README\n\n")
  })

  it("handles multiline body text", () => {
    const issue: Issue = {
      id: "I_125",
      number: 44,
      title: "Add feature",
      bodyText: "First line.\nSecond line.\nThird line.",
      state: "OPEN",
    }

    const result = prepIssue(issue)

    expect(result).toBe("Add feature\n\nFirst line.\nSecond line.\nThird line.")
  })
})

describe("prepPullRequest", () => {
  it("combines title, body, and file paths with newline separators", () => {
    const pr: PullRequest = {
      id: "PR_123",
      number: 42,
      title: "Refactor auth",
      bodyText: "This PR refactors the auth system.",
      state: "OPEN",
      files: {
        nodes: [{ path: "src/auth.ts" }, { path: "src/utils.ts" }],
      },
    }

    const result = prepPullRequest(pr)

    expect(result).toBe(
      "Refactor auth\n\nThis PR refactors the auth system.\n\nsrc/auth.ts\nsrc/utils.ts",
    )
  })

  it("handles PR with no file changes", () => {
    const pr: PullRequest = {
      id: "PR_124",
      number: 43,
      title: "Update docs",
      bodyText: "Fix typos in documentation.",
      state: "OPEN",
      files: {
        nodes: [],
      },
    }

    const result = prepPullRequest(pr)

    expect(result).toBe("Update docs\n\nFix typos in documentation.\n\n")
  })

  it("handles single file change", () => {
    const pr: PullRequest = {
      id: "PR_125",
      number: 44,
      title: "Fix typo",
      bodyText: "",
      state: "CLOSED",
      files: {
        nodes: [{ path: "README.md" }],
      },
    }

    const result = prepPullRequest(pr)

    expect(result).toBe("Fix typo\n\n\n\nREADME.md")
  })

  it("handles empty body with multiple files", () => {
    const pr: PullRequest = {
      id: "PR_126",
      number: 45,
      title: "Config update",
      bodyText: "",
      state: "MERGED",
      files: {
        nodes: [{ path: "package.json" }, { path: "tsconfig.json" }, { path: ".env" }],
      },
    }

    const result = prepPullRequest(pr)

    expect(result).toBe("Config update\n\n\n\npackage.json\ntsconfig.json\n.env")
  })
})
