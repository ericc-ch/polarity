import { eq } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import {
  repositories as repositoriesTable,
  RepositoryFullName,
} from "shared/schema"
import { Database } from "../../lib/db"
import { ValidationError } from "../errors"
import { RepositoriesRpcGroup } from "./contract"

export class RepositoryService extends Effect.Service<RepositoryService>()(
  "api/rpc/groups/repositories/RepositoryService",
  {
    effect: Effect.gen(function* () {
      const db = yield* Database

      return {
        submit: Effect.fn(function* (repoUrl: string) {
          const fullName = yield* parseRepoUrl(repoUrl)

          const existing = yield* Effect.promise(() =>
            db
              .select()
              .from(repositoriesTable)
              .where(eq(repositoriesTable.fullName, fullName))
              .limit(1),
          )

          if (existing.at(0)) {
            return existing.at(0)!
          }

          const now = Date.now()
          const inserted = yield* Effect.promise(() =>
            db
              .insert(repositoriesTable)
              .values({
                fullName,
                status: "pending",
                lastSyncAt: 0,
                errorMessage: null,
                createdAt: now,
                updatedAt: now,
              })
              .returning(),
          )

          const repo = inserted.at(0)
          if (!repo) {
            return yield* new ValidationError({
              message: "Failed to create repository entry",
            })
          }

          return repo
        }),
      }
    }),
  },
) {}

const parseRepoUrl = (url: string): Effect.Effect<string, ValidationError> => {
  const httpsRegex =
    /^https:\/\/github\.com\/([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)\/?$/
  const httpsMatch = url.match(httpsRegex)
  if (httpsMatch) {
    const fullName = `${httpsMatch[1]}/${httpsMatch[2]}`
    return validateFullName(fullName)
  }

  const shorthandRegex = /^([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+)$/
  const shorthandMatch = url.match(shorthandRegex)
  if (shorthandMatch) {
    const fullName = `${shorthandMatch[1]}/${shorthandMatch[2]}`
    return validateFullName(fullName)
  }

  return Effect.fail(
    new ValidationError({
      message:
        "Invalid repository URL. Use format: https://github.com/owner/repo or owner/repo",
    }),
  )
}

const validateFullName = Effect.fn(function* (fullName: string) {
  const result = Schema.decodeUnknownEither(RepositoryFullName)(fullName)
  if (result._tag === "Left") {
    return yield* new ValidationError({
      message: `Invalid repository name: ${fullName}`,
    })
  }
  return result.right
})

export const RepositoriesHandlers = RepositoriesRpcGroup.toLayer({
  RepositoryList: Effect.fn(function* () {
    const db = yield* Database
    return yield* Effect.promise(() => db.select().from(repositoriesTable))
  }),
  RepositorySubmit: Effect.fn(function* (payload) {
    const service = yield* RepositoryService
    return yield* service.submit(payload.repoUrl)
  }),
}).pipe(Layer.provide(RepositoryService.Default))
