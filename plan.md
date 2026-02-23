# migration plan: effect -> hono + tanstack query + zod

## overview

migrate from effect-based stack to traditional async/await with hono rpc, tanstack query, and zod.

**current stack:**

- api: effect + effect rpc + drizzle + better-auth
- web: react + tanstack router + tanstack form + @effect-atom/atom-react
- shared: effect schema + drizzle

**target stack:**

- api: hono + hono rpc + drizzle + better-auth + zod
- web: react + tanstack router + tanstack form + tanstack query + zod
- shared: zod + drizzle

---

## 1. dependencies

### remove (all packages)

- [ ] `effect` ^3.19.18
- [ ] `@effect/platform` ^0.94.5
- [ ] `@effect/rpc` ^0.73.2
- [ ] `@effect/sql` ^0.49.0
- [ ] `@effect/sql-d1` ^0.47.0
- [ ] `@effect/sql-drizzle` ^0.48.1
- [ ] `@effect-atom/atom-react` ^0.5.0
- [ ] `@effect/experimental` ^0.58.0
- [ ] `@effect/language-service` ^0.74.0

### add

- [ ] `hono` ^4.7.0
- [ ] `@hono/zod-validator` ^0.4.3
- [ ] `@tanstack/react-query` ^5.66.0

---

## 2. shared package (packages/shared)

### 2.1 schema/books.sql.ts

**current:** effect schema classes  
**change to:** zod schemas

```typescript
// before (effect)
export class Book extends Schema.Class<Book>("Book")({
  id: BookId,
  title: Schema.String,
  author: Schema.String,
}) {}

// after (zod)
export const Book = z.object({
  id: z.number().positive().int(),
  title: z.string(),
  author: z.string(),
})
export type Book = z.infer<typeof Book>

export const BookInsert = Book.omit({ id: true })
export type BookInsert = z.infer<typeof BookInsert>

export const BookUpdate = BookInsert.partial()
export type BookUpdate = z.infer<typeof BookUpdate>
```

- [x] convert `Book` class to zod schema
- [x] convert `BookId` to zod schema
- [x] convert `BookInsert` to zod schema
- [x] convert `BookUpdate` to zod schema
- [x] export types with `z.infer`
- [x] remove effect imports
- [x] update `main.ts` exports if needed

### 2.2 schema/repositories.sql.ts

**same pattern:** convert effect schema to zod

- [x] convert `Repository` class to zod schema
- [x] convert `RepositoryFullName` to zod schema
- [x] convert `RepositoryId` to zod schema
- [x] convert `RepositoryStatus` to zod enum
- [x] convert `RepositoryInsert` to zod schema
- [x] convert `RepositoryUpdate` to zod schema
- [x] export types with `z.infer`
- [x] remove effect imports

---

## 3. api package (apps/api)

### 3.1 lib/env.ts

**current:** effect schema class  
**change to:** zod + manual parsing

```typescript
// before
export class EnvSchema extends Schema.Class<EnvSchema>("EnvSchema")({
  API_CORS_ORIGIN: Schema.URL.pipe(Schema.optional, ...),
  ...
}) {}

export class EnvContext extends Context.Tag(...) {}

// after
const envSchema = z.object({
  API_CORS_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_BETTER_AUTH_SECRET: z.string().min(1),
  API_BETTER_AUTH_URL: z.string().url().default("http://localhost:1337"),
  API_GITHUB_CLIENT_ID: z.string().min(1),
  API_GITHUB_CLIENT_SECRET: z.string().min(1),
})

export type Env = z.infer<typeof envSchema>

export const parseEnv = (env: Record<string, string>): Env => {
  return envSchema.parse(env)
}
```

- [ ] create zod schema for env vars
- [ ] export `Env` type
- [ ] create `parseEnv` function
- [ ] remove effect schema imports
- [ ] delete `EnvContext`

### 3.2 lib/db.ts

**current:** effect context tag  
**change to:** simple function

```typescript
// before
export class Database extends Context.Tag(...) {}

// after
export type Database = GenericSQLite
export const createDB = (d1: D1Database): Database => {
  return drizzle(d1, { schema })
}
```

- [ ] change `Database` from tag to type alias
- [ ] keep `createDB` function
- [ ] remove effect imports

### 3.3 lib/auth/main.ts + make.ts

**current:** effect service  
**change to:** simple factory function

```typescript
// before
export class Auth extends Effect.Service(...) {
  effect: Effect.gen(function* () {
    const env = yield* EnvContext
    return makeAuth(env)
  })
}

// after
export const createAuth = (env: Env) => {
  return betterAuth({
    secret: env.API_BETTER_AUTH_SECRET,
    baseURL: env.API_BETTER_AUTH_URL,
    trustedOrigins: [env.API_CORS_ORIGIN],
    socialProviders: { github: { clientId: env.API_GITHUB_CLIENT_ID, clientSecret: env.API_GITHUB_CLIENT_SECRET } }
  })
}
```

- [ ] merge `main.ts` and `make.ts` into `auth.ts`
- [ ] create `createAuth` function
- [ ] remove effect service pattern
- [ ] delete `lib/auth/` folder, move to `lib/auth.ts`

### 3.4 rpc/errors.ts -> types/errors.ts

**current:** effect tagged errors  
**change to:** standard error classes

```typescript
// before
export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String },
) {}

// after
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotFoundError"
  }
}

// same for ValidationError, UnauthorizedError, ForbiddenError
```

- [ ] convert `NotFoundError`
- [ ] convert `ValidationError`
- [ ] convert `UnauthorizedError`
- [ ] convert `ForbiddenError`
- [ ] remove effect imports
- [ ] move to `types/errors.ts` (or `lib/errors.ts`)

### 3.5 rpc/books/handler.ts -> routes/books.ts

**current:** effect service + rpc handlers  
**change to:** hono routes + async functions

- [ ] create `routes/books.ts`
- [ ] set up hono app with `new Hono<{ Bindings: Env }>()`
- [ ] create zod schemas for params/body validation
- [ ] `GET /:id` - get book by id with 404 handling
- [ ] `GET /` - list all books
- [ ] `POST /` - create book
- [ ] `PATCH /:id` - update book with 404 handling
- [ ] `DELETE /:id` - delete book with 404 handling
- [ ] export `BooksAppType`
- [ ] delete old `rpc/books/` folder

### 3.6 rpc/repositories/handler.ts -> routes/repositories.ts

**same pattern:** convert to hono routes

- [ ] create `routes/repositories.ts`
- [ ] set up hono app with `new Hono<{ Bindings: Env }>()`
- [ ] create zod schema for submit body
- [ ] `GET /` - list repositories
- [ ] `POST /` - submit repository (parse url, check exists, create)
- [ ] move `parseRepoUrl` logic into route
- [ ] export `RepositoriesAppType`
- [ ] delete old `rpc/repositories/` folder

### 3.7 rpc/util/session.ts

- [ ] determine if still needed (auth session validation)
- [ ] if needed, convert to hono middleware or helper function
- [ ] if not needed, delete

### 3.8 rpc/contract.ts

- [ ] delete file (no longer needed with hono)

### 3.9 main.ts (entry point)

**current:** effect layers + rpc server  
**change to:** hono app composition

```typescript
// before
import { HttpLayerRouter, RpcServer } from "@effect/rpc"
import { Effect, Layer } from "effect"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const EnvLive = Layer.effect(EnvContext, Schema.decodeUnknown(EnvSchema)(env))
    const DatabaseLive = Layer.sync(Database, () => drizzle(env.DB, { schema }))
    ...
    const { handler } = HttpLayerRouter.toWebHandler(AppLive)
    return handler(request)
  }
}

// after
import { Hono } from "hono"
import { cors } from "hono/cors"
import booksRoutes from "./routes/books"
import repositoriesRoutes from "./routes/repositories"
import { createAuth } from "./lib/auth"
import { parseEnv } from "./lib/env"

const app = new Hono<{ Bindings: Env }>()

// middleware
app.use("*", async (c, next) => {
  const env = parseEnv(c.env as Record<string, string>)
  c.set("parsedEnv", env)
  return cors({
    origin: env.API_CORS_ORIGIN,
    credentials: true,
  })(c, next)
})

// health check
app.get("/", (c) => c.text("i'm fine. thanks for asking. finally."))

// auth routes
app.use("/api/auth/*", async (c) => {
  const env = c.get("parsedEnv")
  const auth = createAuth(env)
  return auth.handler(c.req.raw)
})

// api routes
app.route("/api/books", booksRoutes)
app.route("/api/repositories", repositoriesRoutes)

export default app

// type export for client
export type AppType = typeof app
```

- [ ] set up hono app with `new Hono<{ Bindings: Env }>()`
- [ ] add cors middleware with env-based origin
- [ ] add health check route
- [ ] add auth routes handler
- [ ] mount books routes at `/api/books`
- [ ] mount repositories routes at `/api/repositories`
- [ ] export `AppType` for client
- [ ] remove effect imports

---

## 4. web package (apps/web)

### 4.1 lib/rpc.ts -> lib/api.ts

**current:** effect-atom rpc client  
**change to:** hono rpc client

```typescript
// before
import { AtomRpc } from "@effect-atom/atom-react"
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { Layer } from "effect"

const protocolLayer = RpcClient.layerProtocolHttp({
  url: new URL("/rpc", env.VITE_API_URL).href,
}).pipe(Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJsonRpc()]))

export class RpcClientTag extends AtomRpc.Tag<RpcClientTag>()("RpcClient", {
  group: RootRpcGroup,
  protocol: protocolLayer,
}) {}

// after
import { hc } from "hono/client"
import type { AppType } from "api/src/main"
import { env } from "./env"

export const apiClient = hc<AppType>(env.VITE_API_URL, {
  init: { credentials: "include" },
})

export type ApiClient = typeof apiClient
```

- [ ] rename file to `api.ts`
- [ ] create `apiClient` with `hc<AppType>()`
- [ ] set `credentials: "include"` for auth cookies
- [ ] export `ApiClient` type
- [ ] remove effect-atom imports

### 4.2 routes/\_\_root.tsx

**current:** registryprovider from @effect-atom  
**change to:** queryclientprovider from @tanstack/react-query

```typescript
// before
import { RegistryProvider } from "@effect-atom/atom-react"

function RootDocument({ children }) {
  return (
    <html>
      <body>
        <RegistryProvider>{children}</RegistryProvider>
      </body>
    </html>
  )
}

// after
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})

function RootDocument({ children }) {
  return (
    <html>
      <body>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </body>
    </html>
  )
}
```

- [ ] create `QueryClient` instance
- [ ] replace `RegistryProvider` with `QueryClientProvider`
- [ ] remove @effect-atom import
- [ ] add @tanstack/react-query import

### 4.3 routes/\_layout/index.tsx

**current:** useAtomValue + useAtomMount from @effect-atom  
**change to:** useQuery from @tanstack/react-query

```typescript
// before
import { useAtomValue, useAtomMount, Result } from "@effect-atom/atom-react"
import { RpcClientTag } from "@/lib/rpc"

export const Route = createFileRoute("/_layout/")({
  component: function Home() {
    const [searchQuery, setSearchQuery] = useState("")
    const reposAtom = useMemo(() => RpcClientTag.query("RepositoryList", {}), [])
    useAtomMount(reposAtom)
    const reposResult = useAtomValue(reposAtom)

    return (
      <div>
        {Result.match(reposResult, {
          onInitial: () => <div>loading...</div>,
          onFailure: () => <div>failed</div>,
          onSuccess: (repos) => <div>{repos.map(...)}</div>,
        })}
      </div>
    )
  }
})

// after
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/lib/api"

export const Route = createFileRoute("/_layout/")({
  component: function Home() {
    const [searchQuery, setSearchQuery] = useState("")

    const { data: repos, isLoading, error } = useQuery({
      queryKey: ["repositories"],
      queryFn: async () => {
        const res = await apiClient.api.repositories.$get()
        if (!res.ok) throw new Error("failed to fetch repositories")
        return res.json()
      },
    })

    const filteredRepos = useMemo(() => {
      if (!repos) return []
      if (!searchQuery.trim()) return repos
      const query = searchQuery.toLowerCase()
      return repos.filter((repo) => repo.fullName.toLowerCase().includes(query))
    }, [repos, searchQuery])

    return (
      <div>
        {isLoading && <div>loading...</div>}
        {error && <div>failed to load</div>}
        {filteredRepos && filteredRepos.map(...)}
      </div>
    )
  }
})
```

- [ ] replace `useAtomValue` + `useAtomMount` with `useQuery`
- [ ] set `queryKey: ["repositories"]`
- [ ] implement `queryFn` calling `apiClient.api.repositories.$get()`
- [ ] handle `isLoading`, `error`, and `data` states
- [ ] update filteredRepos logic to use `data` instead of `Result`
- [ ] remove @effect-atom imports
- [ ] update import from `@/lib/rpc` to `@/lib/api`

### 4.4 routes/\_layout/submit.tsx

**current:** useAtomSet from @effect-atom for mutations  
**change to:** useMutation from @tanstack/react-query

```typescript
// before
import { useAtomSet } from "@effect-atom/atom-react"
import { RpcClientTag } from "@/lib/rpc"
import { Schema } from "effect"

const submitSchema = Schema.standardSchemaV1(
  Schema.Struct({
    repoUrl: Schema.String.pipe(Schema.minLength(1), ...)
  })
)

export const Route = createFileRoute("/_layout/submit")({
  component: function Submit() {
    const submitRepo = useAtomSet(RpcClientTag.mutation("RepositorySubmit"), { mode: "promise" })

    const form = useForm({
      onSubmit: async ({ value }) => {
        const result = await submitRepo({
          payload: { repoUrl: value.repoUrl },
          reactivityKeys: ["repositories"],
        })
      }
    })
  }
})

// after
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api"
import { z } from "zod"

const submitSchema = z.object({
  repoUrl: z.string().min(1, "repository url is required").refine(
    (url) => {
      const githubRegex = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/?$/
      const shorthandRegex = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/
      return githubRegex.test(url) || shorthandRegex.test(url)
    },
    { message: "enter a valid github repository url" }
  ),
})

export const Route = createFileRoute("/_layout/submit")({
  component: function Submit() {
    const queryClient = useQueryClient()

    const submitRepo = useMutation({
      mutationFn: async (repoUrl: string) => {
        const res = await apiClient.api.repositories.$post({
          json: { repoUrl },
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(error.error || "failed to submit")
        }
        return res.json()
      },
      onSuccess: () => {
        // invalidate and refetch repositories
        queryClient.invalidateQueries({ queryKey: ["repositories"] })
      },
    })

    const form = useForm({
      onSubmit: async ({ value }) => {
        await submitRepo.mutateAsync(value.repoUrl)
      }
    })
  }
})
```

- [ ] replace `useAtomSet` with `useMutation` + `useQueryClient`
- [ ] implement `mutationFn` calling `apiClient.api.repositories.$post()`
- [ ] add `onSuccess` callback to invalidate repositories query
- [ ] convert effect schema to zod schema
- [ ] update form submit to use `mutateAsync`
- [ ] remove @effect-atom imports
- [ ] remove effect imports
- [ ] update import from `@/lib/rpc` to `@/lib/api`

---

## 5. file structure changes

### current structure

```
apps/api/src/
  main.ts
  lib/
    auth/
      main.ts
      make.ts
      dummy.ts
    db.ts
    env.ts
  rpc/
    contract.ts
    errors.ts
    books/
      contract.ts
      handler.ts
    repositories/
      contract.ts
      handler.ts
    util/
      session.ts

apps/web/src/
  lib/
    rpc.ts
    auth.ts
    utils.ts
    env.ts
  routes/
    __root.tsx
    _layout/
      route.tsx
      index.tsx
      submit.tsx

packages/shared/src/
  schema/
    main.ts
    books.sql.ts
    repositories.sql.ts
```

### new structure

```
apps/api/src/
  main.ts                 # hono app entry
  lib/
    auth.ts               # merged main.ts + make.ts
    db.ts                 # simplified
    env.ts                # zod parsing
  routes/                 # renamed from rpc/
    books.ts              # merged contract + handler
    repositories.ts       # merged contract + handler
  types/
    errors.ts             # standard error classes

apps/web/src/
  lib/
    api.ts                # renamed from rpc.ts - hono client
    auth.ts               # unchanged
    utils.ts              # unchanged
    env.ts                # unchanged
  routes/
    __root.tsx            # queryclientprovider
    _layout/
      route.tsx           # unchanged
      index.tsx           # tanstack query
      submit.tsx          # tanstack query + mutation

packages/shared/src/
  schema/
    main.ts               # unchanged
    books.sql.ts          # zod schemas
    repositories.sql.ts   # zod schemas
```

- [ ] reorganize api folder structure
- [ ] delete `rpc/` folder and subfolders
- [ ] create `routes/` folder
- [ ] create `types/` folder
- [ ] merge `lib/auth/` into `lib/auth.ts`
- [ ] rename `web/lib/rpc.ts` to `web/lib/api.ts`

---

## 6. migration order

1. [ ] **shared package** - convert effect schema to zod (no breaking changes yet)
   - [x] books.sql.ts
   - [x] repositories.sql.ts
   - [x] run typecheck
   - [ ] run tests if any

2. [ ] **api package** - rewrite with hono (parallel to existing, test both)
   - [ ] lib/env.ts
   - [ ] lib/db.ts
   - [ ] lib/auth.ts (merge main + make)
   - [ ] routes/books.ts
   - [ ] routes/repositories.ts
   - [ ] main.ts
   - [ ] run typecheck
   - [ ] test all routes manually

3. [ ] **web package** - rewrite with tanstack query (parallel to existing)
   - [ ] lib/api.ts
   - [ ] routes/\_\_root.tsx
   - [ ] routes/\_layout/index.tsx
   - [ ] routes/\_layout/submit.tsx
   - [ ] run typecheck

4. [ ] **integration testing** - verify all routes work
   - [ ] test health check
   - [ ] test auth routes
   - [ ] test books crud
   - [ ] test repositories list/submit
   - [ ] test frontend data fetching
   - [ ] test frontend mutations + cache invalidation

5. [ ] **cleanup** - remove effect dependencies and dead code
   - [ ] delete old rpc/ folder in api
   - [ ] delete lib/auth/ folder in api
   - [ ] remove effect dependencies from package.json files
   - [ ] remove effect catalog from pnpm-workspace.yaml
   - [ ] run pnpm install
   - [ ] run typecheck
   - [ ] run lint
   - [ ] run tests

---

## 7. key pattern mappings

| effect pattern            | new pattern                                 |
| ------------------------- | ------------------------------------------- |
| `Effect.Service`          | regular class or plain functions            |
| `Context.Tag`             | direct dependency passing or simple closure |
| `Effect.gen`              | async/await functions                       |
| `Effect.promise`          | direct await                                |
| `Effect.fail`             | throw error + catch at route level          |
| `RpcGroup.make`           | hono route definitions                      |
| `Rpc.make`                | hono http methods (.get, .post, etc)        |
| `useAtomValue`            | `useQuery`                                  |
| `useAtomSet`              | `useMutation`                               |
| `reactivityKeys`          | `queryClient.invalidateQueries`             |
| `Schema.TaggedError`      | standard error classes                      |
| `Schema.Class`            | zod object schemas                          |
| `Schema.String.pipe(...)` | zod chained methods                         |

---

## 8. notes

- hono rpc preserves full type safety between server and client via `hc<AppType>()`
- tanstack query provides caching, loading states, error handling, and background refetching
- zod is already in the project (catalog), just needs to replace effect schema
- better-auth integration stays the same, just wrapped differently
- drizzle orm usage stays the same, just wrapped in async/await
- auth session validation: pass through hono context or validate in middleware
- error handling: use hono's `c.json({ error: ... }, status)` pattern
