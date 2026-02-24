import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { parseGitHubRepoUrl, repositories as repositoriesTable } from "shared"
import { protectedMiddleware } from "../middleware/protected"
import type { HonoContext } from "../types"

const submitSchema = z.object({
  repoUrl: z.string().min(1),
})

const app = new Hono<HonoContext>()
  .get("/", async (c) => {
    const db = c.get("db")
    const data = await db.select().from(repositoriesTable)
    return c.json({ data })
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

      const { fullName } = parseResult
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

      const repo = inserted.at(0)
      if (!repo) {
        return c.json({ error: "Failed to create repository entry" }, 500)
      }

      return c.json(repo, 201)
    },
  )

export default app
