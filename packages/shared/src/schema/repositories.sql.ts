import * as sqlite from "drizzle-orm/sqlite-core"
import { z } from "zod"

export const repositoryStatus = [
  "pending",
  "backfilling",
  "syncing",
  "active",
  "error",
] as const

export const repositories = sqlite.sqliteTable("repositories", {
  fullName: sqlite.text().primaryKey(),
  status: sqlite.text({ enum: repositoryStatus }).notNull().default("pending"),
  lastSyncAt: sqlite.integer().notNull().default(0),
  errorMessage: sqlite.text(),
  createdAt: sqlite.integer().notNull(),
  updatedAt: sqlite.integer().notNull(),
})

export const RepositoryFullName = z
  .string()
  .regex(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)

export const RepositoryId = RepositoryFullName

export const RepositoryStatus = z.enum(repositoryStatus)

export const Repository = z.object({
  fullName: RepositoryFullName,
  status: RepositoryStatus,
  lastSyncAt: z.number().int(),
  errorMessage: z.string().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})

export type Repository = z.infer<typeof Repository>
export type RepositoryStatus = z.infer<typeof RepositoryStatus>

export const RepositoryInsert = Repository.omit({
  fullName: true,
  createdAt: true,
  updatedAt: true,
})
export type RepositoryInsert = z.infer<typeof RepositoryInsert>

export const RepositoryUpdate = RepositoryInsert.partial()
export type RepositoryUpdate = z.infer<typeof RepositoryUpdate>
