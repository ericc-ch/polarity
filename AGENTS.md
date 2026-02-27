This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.

## Architecture

Monorepo with Hono API, Vite + React + TanStack Start frontend.

**Stack:**

- API: Hono (Cloudflare Workers)
- Web: Vite + React + TanStack Start + React Query
- Database: SQLite via Cloudflare D1, Drizzle ORM
- Auth: Better Auth
- UI: Tailwind CSS v4, shadcn/ui, Lucide icons

**Key files:**

- `apps/api/src/main.ts` - Hono API entry point
- `apps/web/src/main.tsx` - Web entry point
- `apps/web/src/lib/api.ts` - Hono RPC client
- `apps/web/src/routes/__root.tsx` - React Query provider setup
- `packages/shared/src/schema/main.ts` - Drizzle schemas
- `alchemy.run.ts` - Cloudflare deployment config

## Development

- `pnpm run dev` - Start all services
- `pnpm run typecheck` - TypeScript checks
- `pnpm run test` - Run tests
- `pnpm run lint` - Lint with oxlint
- `pnpm run format` - Format with Prettier

Always run typecheck, test, and lint after changes (in that order).

## Coding Standards

- Never write explicit types - let TypeScript infer
- No `.js` extensions in imports
- Named exports preferred
- Use `main.ts` not `index.ts`
- No margin utilities - use `gap-*` instead
- Keep HTML flat - avoid deep nesting
