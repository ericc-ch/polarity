import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { BookInsert, BookUpdate, books as booksTable } from "shared/schema"
import type { Database } from "../lib/db"

type Bindings = Env & { DB: D1Database }

type Variables = {
  db: Database
}

const bookIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .get("/:id", zValidator("param", bookIdParamSchema), async (c) => {
    const { id } = c.req.valid("param")
    const db = c.get("db")

    const data = await db.select().from(booksTable).where(eq(booksTable.id, id)).limit(1)

    const book = data.at(0)
    if (!book) {
      return c.json({ error: `Book with id ${id} not found` }, 404)
    }

    return c.json(book)
  })
  .get("/", async (c) => {
    const db = c.get("db")
    const data = await db.select().from(booksTable)
    return c.json({ data })
  })
  .post("/", zValidator("json", BookInsert), async (c) => {
    const payload = c.req.valid("json")
    const db = c.get("db")
    const inserted = await db.insert(booksTable).values(payload).returning()
    const book = inserted.at(0)

    if (!book) {
      return c.json({ error: "Failed to create book" }, 500)
    }

    return c.json(book, 201)
  })
  .patch(
    "/:id",
    zValidator("param", bookIdParamSchema),
    zValidator("json", BookUpdate),
    async (c) => {
      const { id } = c.req.valid("param")
      const data = c.req.valid("json")
      const db = c.get("db")
      const updated = await db
        .update(booksTable)
        .set(data)
        .where(eq(booksTable.id, id))
        .returning()
        .limit(1)

      const book = updated.at(0)
      if (!book) {
        return c.json({ error: `Book with id ${id} not found` }, 404)
      }

      return c.json(book)
    },
  )
  .delete("/:id", zValidator("param", bookIdParamSchema), async (c) => {
    const { id } = c.req.valid("param")
    const db = c.get("db")
    const deleted = await db.delete(booksTable).where(eq(booksTable.id, id)).returning().limit(1)

    const book = deleted.at(0)
    if (!book) {
      return c.json({ error: `Book with id ${id} not found` }, 404)
    }

    return c.json(book)
  })

export default app
