import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import {
  RepositoryFullName,
  repositories as repositoriesTable,
} from "shared/schema"
import { createDB } from "../lib/db"
import type { Env } from "../lib/env"

type Bindings = Env & { DB: D1Database }

const submitSchema = z.object({
  repoUrl: z.string().min(1),
})

const app = new Hono<{ Bindings: Bindings }>()

app.get("/", async (c) => {
  const db = createDB(c.env.DB)
  const data = await db.select().from(repositoriesTable)
  return c.json({ data })
})

app.post("/", zValidator("json", submitSchema), async (c) => {
  const { repoUrl } = c.req.valid("json")
  const parseResult = parseRepoUrl(repoUrl)

  if ("error" in parseResult) {
    return c.json({ error: parseResult.error }, 400)
  }

  const { fullName } = parseResult
  const db = createDB(c.env.DB)

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
})

type ParseResult = { fullName: string } | { error: string }

const parseRepoUrl = (url: string): ParseResult => {
  const trimmed = url.trim()
  const httpsRegex =
    /^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/?$/
  const httpsMatch = trimmed.match(httpsRegex)
  if (httpsMatch) {
    return validateFullName(`${httpsMatch[1]}/${httpsMatch[2]}`)
  }

  const shorthandRegex = /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/
  const shorthandMatch = trimmed.match(shorthandRegex)
  if (shorthandMatch) {
    return validateFullName(`${shorthandMatch[1]}/${shorthandMatch[2]}`)
  }

  return {
    error:
      "Invalid repository URL. Use format: https://github.com/owner/repo or owner/repo",
  }
}

const validateFullName = (fullName: string): ParseResult => {
  const result = RepositoryFullName.safeParse(fullName)
  if (!result.success) {
    return { error: `Invalid repository name: ${fullName}` }
  }
  return { fullName: result.data }
}

export type RepositoriesAppType = typeof app

export default app
