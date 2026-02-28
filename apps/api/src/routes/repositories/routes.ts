import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { parseGitHubRepoUrl, repositories as repositoriesTable } from "shared"
import { compressGzip, decompressGzip } from "../../lib/compression"
import { hashPr } from "../../lib/hash"
import { generateEmbeddings, prepIssue, prepPullRequest } from "../../lib/embedding"
import { getOctokit } from "../../lib/octokit"
import { protectedMiddleware } from "../../middleware/protected"
import type { HonoContext } from "../../types"
import { FETCH_ISSUES_QUERY, FETCH_PULL_REQUESTS_QUERY, type GraphQLResponse } from "./queries"

const submitSchema = z.object({
  repoUrl: z.string().min(1),
})

interface IssueVector {
  id: string
  number: number
  state: "open" | "closed"
  vector: number[]
}

interface PullRequestVector extends IssueVector {
  hash: string
}

interface VectorObject {
  repo: string
  syncedAt: number
  issues: { [id: string]: IssueVector }
  pullRequests: { [id: string]: PullRequestVector }
}

export const repositoriesRoutes = new Hono<HonoContext>()
  .get("/", async (c) => {
    const db = c.get("db")
    const data = await db.select().from(repositoriesTable)
    return c.json({ data })
  })
  .get("/:owner/:repo", async (c) => {
    const owner = c.req.param("owner")
    const repo = c.req.param("repo")
    const db = c.get("db")
    const repoData = await db
      .select()
      .from(repositoriesTable)
      .where(and(eq(repositoriesTable.owner, owner), eq(repositoriesTable.repo, repo)))
      .limit(1)
    const result = repoData.at(0)
    if (!result) {
      return c.json({ error: "Repository not found" }, 404)
    }
    return c.json(result)
  })
  .post("/", protectedMiddleware, zValidator("json", submitSchema), async (c) => {
    const { repoUrl } = c.req.valid("json")
    const parseResult = parseGitHubRepoUrl(repoUrl)

    if ("error" in parseResult) {
      return c.json({ error: parseResult.error }, 400)
    }

    const { owner, repo: repoName } = parseResult
    const db = c.get("db")

    const existing = await db
      .select()
      .from(repositoriesTable)
      .where(and(eq(repositoriesTable.owner, owner), eq(repositoriesTable.repo, repoName)))
      .limit(1)

    const existingRepo = existing.at(0)
    if (existingRepo) {
      return c.json(existingRepo)
    }

    const now = Date.now()
    const inserted = await db
      .insert(repositoriesTable)
      .values({
        owner,
        repo: repoName,
        lastSyncAt: 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    const newRepo = inserted.at(0)
    if (!newRepo) {
      return c.json({ error: "Failed to create repository entry" }, 500)
    }

    return c.json(newRepo, 201)
  })
  .post("/:owner/:repo/sync", protectedMiddleware, async (c) => {
    const owner = c.req.param("owner")
    const repo = c.req.param("repo")
    const fullRepoName = `${owner}/${repo}`

    const db = c.get("db")
    const storage = c.env.STORAGE

    // Check if already syncing
    const repoData = await db
      .select()
      .from(repositoriesTable)
      .where(and(eq(repositoriesTable.owner, owner), eq(repositoriesTable.repo, repo)))
      .limit(1)

    const repository = repoData.at(0)
    if (!repository) {
      return c.json({ error: "Repository not found" }, 404)
    }

    const octokit = await getOctokit(c)

    try {
      const since = repository.lastSyncAt > 0 ? new Date(repository.lastSyncAt).toISOString() : null
      const objectKey = `${owner}/${repo}.json.gz`

      let existingVectorObject: VectorObject | null = null
      const existingData = await storage.get(objectKey)

      if (existingData) {
        const decompressed = await decompressGzip(await existingData.arrayBuffer())
        existingVectorObject = JSON.parse(decompressed) as VectorObject
      }

      // Build the vector object
      const mergedIssues: { [id: string]: IssueVector } = existingVectorObject?.issues ?? {}
      const mergedPullRequests: { [id: string]: PullRequestVector } =
        existingVectorObject?.pullRequests ?? {}

      // Fetch all issues with pagination
      const allIssues: Array<{
        id: string
        number: number
        title: string
        bodyText: string
        state: "OPEN" | "CLOSED"
      }> = []
      let hasNextPage = true
      let cursor: string | null = null

      while (hasNextPage) {
        const issuesResponse: GraphQLResponse = await octokit.graphql<GraphQLResponse>(
          FETCH_ISSUES_QUERY,
          {
            owner,
            repo,
            first: 100,
            after: cursor,
            since,
          },
        )

        allIssues.push(...issuesResponse.repository.issues.nodes)
        hasNextPage = issuesResponse.repository.issues.pageInfo.hasNextPage
        cursor = issuesResponse.repository.issues.pageInfo.endCursor
      }

      // Fetch all pull requests with pagination
      const allPRs: Array<{
        id: string
        number: number
        title: string
        bodyText: string
        state: "OPEN" | "CLOSED" | "MERGED"
        files: { nodes: Array<{ path: string }> }
      }> = []
      hasNextPage = true
      cursor = null

      while (hasNextPage) {
        const prsResponse: GraphQLResponse = await octokit.graphql<GraphQLResponse>(
          FETCH_PULL_REQUESTS_QUERY,
          {
            owner,
            repo,
            first: 100,
            after: cursor,
          },
        )

        allPRs.push(...prsResponse.repository.pullRequests.nodes)
        hasNextPage = prsResponse.repository.pullRequests.pageInfo.hasNextPage
        cursor = prsResponse.repository.pullRequests.pageInfo.endCursor
      }

      // Process issues: filter open ones, embed them, build map
      const openIssues = allIssues.filter((i) => i.state === "OPEN")
      const issueTexts = openIssues.map((i) => prepIssue(i))
      const issueEmbeddings = issueTexts.length > 0 ? await generateEmbeddings(issueTexts) : []

      const issueVectors = new Map<string, IssueVector>()
      for (let i = 0; i < openIssues.length; i++) {
        const issue = openIssues[i]!
        issueVectors.set(issue.id, {
          id: issue.id,
          number: issue.number,
          state: "open",
          vector: issueEmbeddings[i]!,
        })
      }

      // Remove closed issues from mergedIssues
      for (const issue of allIssues) {
        if (issue.state !== "OPEN") {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete mergedIssues[issue.id]
        }
      }

      // Process PRs: compute hashes, filter ones needing embedding, embed them
      const prsToEmbed: typeof allPRs = []
      const prHashes = new Map<string, string>()

      for (const pr of allPRs) {
        const hash = await hashPr(pr)
        prHashes.set(pr.id, hash)
        const existing = mergedPullRequests[pr.id]
        if (!existing || existing.hash !== hash) {
          prsToEmbed.push(pr)
        }
      }

      const prTexts = prsToEmbed.map((pr) => prepPullRequest(pr))
      const prEmbeddings = prTexts.length > 0 ? await generateEmbeddings(prTexts) : []

      const prVectors = new Map<string, PullRequestVector>()
      for (let i = 0; i < prsToEmbed.length; i++) {
        const pr = prsToEmbed[i]!
        prVectors.set(pr.id, {
          id: pr.id,
          number: pr.number,
          state: pr.state === "OPEN" ? "open" : "closed",
          hash: prHashes.get(pr.id)!,
          vector: prEmbeddings[i]!,
        })
      }

      // Merge new issue vectors into mergedIssues
      for (const [id, issueVector] of issueVectors) {
        mergedIssues[id] = issueVector
      }

      // Merge PR vectors into mergedPullRequests
      for (const pr of allPRs) {
        const hash = prHashes.get(pr.id)!
        if (prVectors.has(pr.id)) {
          mergedPullRequests[pr.id] = prVectors.get(pr.id)!
        } else {
          // Keep existing vector, update hash and state
          const existing = mergedPullRequests[pr.id]!
          mergedPullRequests[pr.id] = {
            id: existing.id,
            number: existing.number,
            vector: existing.vector,
            hash,
            state: pr.state === "OPEN" ? "open" : "closed",
          }
        }
      }

      // Build final vector object
      const vectorObject: VectorObject = {
        repo: fullRepoName,
        syncedAt: Date.now(),
        issues: mergedIssues,
        pullRequests: mergedPullRequests,
      }

      // Compress and write to R2
      const json = JSON.stringify(vectorObject)
      const compressed = await compressGzip(json)
      await storage.put(objectKey, compressed, {
        httpMetadata: { contentType: "application/gzip" },
      })

      // Update D1 with sync info
      await db
        .update(repositoriesTable)
        .set({
          lastSyncAt: Date.now(),
          updatedAt: Date.now(),
        })
        .where(and(eq(repositoriesTable.owner, owner), eq(repositoriesTable.repo, repo)))

      return c.json({
        repo: fullRepoName,
        lastSyncAt: vectorObject.syncedAt,
        issuesCount: Object.keys(mergedIssues).length,
        pullRequestsCount: Object.keys(mergedPullRequests).length,
      })
    } catch (error) {
      console.error(error)

      return c.json(
        {
          error: "Sync failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      )
    }
  })
