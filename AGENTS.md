This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Workflow

Always explore the codebase first using grep/glob/read tools to understand the structure, then explore the .context/ directory to find relevant library source code. ONLY use documentation tools (documentation_resolve-library-id, documentation_query-docs) if the .context/ directory does not contain the library you need. Then load relevant skill when working on something.

## Architecture

Monorepo structure:

- apps/api: Effect + Effect RPC (Cloudflare Workers)
- apps/web: Vite + React + TanStack Start
- packages/shared: Effect RPC contracts, Drizzle schemas, Zod validation

Tech stack:

- Runtime: Cloudflare Workers deployed via Alchemy (no wrangler.toml)
- Database: SQLite via Cloudflare D1, Drizzle ORM
- Auth: Better Auth
- UI: Tailwind CSS v4, shadcn/ui (Base UI primitives), Lucide icons

References:

- apps/api/src/main.ts - API entry point
- apps/web/src/main.tsx - Web entry point
- packages/shared/src/contract/main.ts - Effect RPC contract definitions
- packages/shared/src/schema/main.ts - Drizzle schemas
- alchemy.run.ts - Cloudflare deployment config

## Context

The .context/ directory contains cloned repositories of libraries used in this project.
Prioritize reading source code here over using external documentation tools.

- Run `pnpm run prepare` to clone/update repos (runs automatically on install)
- Configure repos in scripts/context-pull.ts

## Development

Commands:

- pnpm run dev - Start all services via Alchemy
- pnpm run typecheck - Run TypeScript checks
- pnpm run test - Run Vitest (in apps/api/, single file: vitest path/to/file.test.ts)
- pnpm run lint - Lint with oxlint
- pnpm run format - Format with Prettier

Always run typecheck, test, and lint after making changes.

Git commits use conventional format: type: description (all lowercase, concise, no body)
Always break down large changes into multiple focused atomic commits.

## Coding Standards

- Minimize explicit types - Let TypeScript infer types wherever possible; only annotate when inference fails or for public API boundaries. With Effect, you almost never need explicit types - trust the inference.
- No semicolons - Prettier enforces semi: false
- Strict TypeScript - strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes enabled
- ESM only - Use import/export, no CommonJS
- Imports order - External deps, workspace packages, relative imports; type imports use `import type`
- Named exports - Prefer named exports over default exports
- Naming - camelCase for variables/functions, PascalCase for types/components, kebab-case for files
- No index.ts - Use main.ts instead (explicit names are easier to find)
- Error handling - Use ORPCError for RPC errors; check .at(0) results before returning

## App-Specific Guidelines

### apps/web (Vite + React + TanStack Start)

#### Effect RPC

Type-safe RPC via `@effect-atom/atom-react`.

**Queries (readonly):**

```typescript
import { useAtomValue } from "@effect-atom/atom-react"
import { RpcClientTag } from "@/lib/rpc"

const result = useAtomValue(RpcClientTag.query("methodName", payload))
// result is Result.Result<SuccessType>
```

**Mutations:**

```typescript
import { useAtomSet } from "@effect-atom/atom-react"
import { RpcClientTag } from "@/lib/rpc"

const mutate = useAtomSet(RpcClientTag.mutation("methodName"))
mutate({ payload, reactivityKeys?: ["users"] })
```

**Cache invalidation:**

```typescript
// Query with reactivity key
const data = useAtomValue(
  RpcClientTag.query("getUsers", void 0, { reactivityKeys: ["users"] }),
)

// Mutation that invalidates the query
const createUser = useAtomSet(RpcClientTag.mutation("createUser"))
createUser({ payload: newUser, reactivityKeys: ["users"] })
```

**References:** `apps/web/src/lib/rpc.ts`, `apps/web/src/routes/__root.tsx`

#### Components

shadcn/ui (new-york), Tailwind v4, Base UI primitives, Lucide icons.

```bash
# From apps/web/
pnpm dlx shadcn@latest search <query>
pnpm dlx shadcn@latest add <component>
```

**References:** `apps/web/components.json`

#### Typography

Use semantic text sizes:

```typescript
<h1 className="text-h1">Heading</h1>
<p className="text-body">Body text</p>
<span className="text-small">Small text</span>
```

Available: `text-h1` through `text-h4`, `text-lead`, `text-large`, `text-body`, `text-small`

**References:** `apps/web/src/index.css`

#### Forms

TanStack Form with Standard Schema validation.

**Effect Schema (recommended):**

```typescript
import { Schema } from "effect"

const formSchema = Schema.standardSchemaV1(
  Schema.Struct({
    email: Schema.String.pipe(
      Schema.minLength(1, { message: () => "Required" }),
      Schema.pattern(/^.+@.+$/, { message: () => "Invalid email" }),
    ),
  }),
)

type FormData = Schema.Schema.Type<typeof formSchema>

const form = useForm({
  defaultValues: { email: "" } as FormData,
  validators: { onSubmit: formSchema },
  onSubmit: async ({ value }) => {
    console.log(value)
  },
})
```

**Patterns:**

- `Schema.standardSchemaV1()` - Wraps Effect Schema for TanStack Form
- `Schema.String.pipe()` - Chain validations
- `filter()` - Return `true` or string error message
- `message: () => "..."` - Error message function
- `Schema.Schema.Type<typeof schema>` - Infer TypeScript type

**References:**

- Effect Schema: `apps/web/src/routes/submit.tsx`
- TanStack Form docs: https://tanstack.com/form/latest

#### Authentication

Better Auth via `better-auth/react`.

**Check session:**

```typescript
import { auth } from "@/lib/auth"

const { data: session, isPending, error, refetch } = auth.useSession()
if (session) return <div>Welcome {session.user.name}</div>
```

**Sign in/out:**

```typescript
// Social auth
const { error } = await auth.signIn.social({
  provider: "github",
  callbackURL: window.location.href,
})

// Sign out
await auth.signOut()
```

**Error handling:** All methods return `{ data, error }` - always check for errors.

**References:**

- Client setup: `apps/web/src/lib/auth.ts`
- Usage example: `apps/web/src/routes/index.tsx`

#### Common Patterns

**Button Links (not nested):**

```typescript
import { Link } from "@tanstack/react-router"
import { buttonVariants } from "@/components/ui/button"

// Correct
<Link to="/submit" className={buttonVariants({ variant: "outline" })}>
  Submit
</Link>
```

**Dropdown Menu (Base UI):**

- No nested buttons: `DropdownMenuTrigger` renders as `<button>`, don't wrap with `<Button>`
- Label requires Group: `DropdownMenuLabel` must be wrapped in `DropdownMenuGroup`

**Layout spacing:**

- **Never use margin** (`m-*`, `mx-*`, `my-*`, `mt-*`, `space-x-*`, `space-y-*`)
- **Use gaps instead**: `flex flex-col gap-4` or `grid gap-4`

**HTML Structure:**

- **Keep it flat** - Avoid deep nesting of divs, use gap for spacing instead of wrapper containers
- **Prefer sibling elements over nested wrappers** - Instead of nested divs with margins, use flex/grid gaps
- **Example:** Replace `<div><div className="mb-4">...</div><div>...</div></div>` with `<div className="flex flex-col gap-4">...</div>`

**Form submission:**

```typescript
// Always use void for linting
<form onSubmit={void form.handleSubmit()}>
```

**Reactive form state:**

```typescript
// Use Subscribe for reactive UI
<form.Subscribe
  selector={(state) => state.isSubmitting}
  children={(isSubmitting) => (
    <Button disabled={isSubmitting}>
      {isSubmitting ? "Submitting..." : "Submit"}
    </Button>
  )}
/>
```

**References:** `apps/web/src/routes/index.tsx`

---

### apps/api (Effect + Effect RPC + Cloudflare Workers)

#### Dependency Injection

The API uses a DI pattern where services are created once at startup and passed through:

- `Env` (global) = Cloudflare bindings (DB, KV) from Alchemy
- `ParsedEnv` = Zod-validated app config (env vars like API_CORS_ORIGIN)
- Access bindings directly from cloudflareEnv.DB, env vars through services.env

**References:**

- `apps/api/src/lib/services.ts`
- `apps/api/src/lib/env.ts`
