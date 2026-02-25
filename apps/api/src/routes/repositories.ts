import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { Octokit, RequestError } from "octokit"
import { z } from "zod"
import { parseGitHubRepoUrl, repositories as repositoriesTable } from "shared"
import { protectedMiddleware } from "../middleware/protected"
import type { HonoContext } from "../types"
import type { ContentfulStatusCode } from "hono/utils/http-status"

const submitSchema = z.object({
  repoUrl: z.string().min(1),
})

const app = new Hono<HonoContext>()
  .get("/", async (c) => {
    const db = c.get("db")
    const data = await db.select().from(repositoriesTable)
    return c.json({ data })
  })
  .get("/:owner/:repo", async (c) => {
    const owner = c.req.param("owner")
    const repo = c.req.param("repo")
    const fullName = `${owner}/${repo}`
    const db = c.get("db")
    const repoData = await db
      .select()
      .from(repositoriesTable)
      .where(eq(repositoriesTable.fullName, fullName))
      .limit(1)
    const result = repoData.at(0)
    if (!result) {
      return c.json({ error: "Repository not found" }, 404)
    }
    return c.json(result)
  })
  .post(
    "/",
    protectedMiddleware,
    zValidator("json", submitSchema),
    async (c) => {
      const { repoUrl } = c.req.valid("json")
      const parseResult = parseGitHubRepoUrl(repoUrl)

      if ("error" in parseResult) {
        return c.json({ error: parseResult.error }, 400)
      }

      const { fullName, owner, repo: repoName } = parseResult
      const db = c.get("db")

      const existing = await db
        .select()
        .from(repositoriesTable)
        .where(eq(repositoriesTable.fullName, fullName))
        .limit(1)

      const existingRepo = existing.at(0)
      if (existingRepo) {
        return c.json(existingRepo)
      }

      // Get user's GitHub OAuth token
      const tokenResponse = await c.var.auth.api.getAccessToken({
        headers: c.req.raw.headers,
        body: {
          providerId: "github",
        },
      })

      if (!tokenResponse.accessToken) {
        return c.json({ error: "No GitHub account linked" }, 400)
      }

      // Fetch repo info from GitHub API using Octokit
      const octokit = new Octokit({ auth: tokenResponse.accessToken })

      let repoData
      try {
        const { data } = await octokit.rest.repos.get({
          owner,
          repo: repoName,
        })
        repoData = data
      } catch (error) {
        if (error instanceof RequestError) {
          return c.json(
            {
              error: "Failed to fetch repository from GitHub",
              message: error.message,
            },
            (error.status as ContentfulStatusCode) ?? 400,
          )
        }
        throw error
      }

      console.log("GitHub repo data:", repoData)

      const now = Date.now()
      const inserted = await db
        .insert(repositoriesTable)
        .values({
          fullName,
          status: "pending",
          lastSyncAt: 0,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      const newRepo = inserted.at(0)
      if (!newRepo) {
        return c.json({ error: "Failed to create repository entry" }, 500)
      }

      return c.json(newRepo, 201)
    },
  )
  .post("/:owner/:repo/sync", protectedMiddleware, async (c) => {
    const owner = c.req.param("owner")
    const repo = c.req.param("repo")

    // Get user's GitHub OAuth token
    const tokenResponse = await c.var.auth.api.getAccessToken({
      headers: c.req.raw.headers,
      body: {
        providerId: "github",
      },
    })

    if (!tokenResponse.accessToken) {
      return c.json({ error: "No GitHub account linked" }, 400)
    }

    const octokit = new Octokit({ auth: tokenResponse.accessToken })

    // GraphQL query to fetch 1 issue and 1 PR with their details
    type GraphQLResponse = {
      repository: {
        issues: {
          nodes: Array<{ title: string; bodyText: string }>
        }
        pullRequests: {
          nodes: Array<{
            title: string
            bodyText: string
            files: {
              nodes: Array<{ path: string }>
            }
          }>
        }
      }
    }

    const { repository } = await octokit.graphql<GraphQLResponse>(
      /* GraphQL */ `
        query ($owner: String!, $repo: String!) {
          repository(owner: $owner, name: $repo) {
            issues(first: 1, states: OPEN) {
              nodes {
                title
                bodyText
              }
            }
            pullRequests(first: 1, states: OPEN) {
              nodes {
                title
                bodyText
                files(first: 100) {
                  nodes {
                    path
                  }
                }
              }
            }
          }
        }
      `,
      {
        owner,
        repo,
      },
    )

    const issue = repository.issues.nodes.at(0) ?? null
    const pullRequest = repository.pullRequests.nodes.at(0) ?? null

    console.log("Fetched issue:", issue)
    console.log("Fetched PR:", pullRequest)

    return c.json({
      issue,
      pullRequest,
    })
  })

export default app
