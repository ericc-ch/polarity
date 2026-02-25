import alchemy, { type Scope } from "alchemy"
import { D1Database, TanStackStart, Worker } from "alchemy/cloudflare"
import { Exec } from "alchemy/os"
import { CloudflareStateStore, FileSystemStateStore } from "alchemy/state"
import { envSchema as apiEnvSchema } from "api/env"
import { config } from "dotenv"
import { z } from "zod"

config({ path: "./.env" })
config({ path: "./apps/api/.env" })
config({ path: "./apps/web/.env" })

const AlchemyEnvSchema = z.object({
  ALCHEMY_PASSWORD: z.string().min(1),
  ALCHEMY_STAGE: z.enum(["dev", "main"]).default("dev"),
  ALCHEMY_REMOTE_STATE: z.enum(["true", "false"]).default("false"),
})

const RemoteEnvSchema = z.object({
  WEB_DOMAIN: z.string().min(1),
  API_DOMAIN: z.string().min(1),
})

const alchemyEnvRaw = AlchemyEnvSchema.parse(process.env)
const alchemyEnv = {
  ...alchemyEnvRaw,
  ALCHEMY_REMOTE_STATE: alchemyEnvRaw.ALCHEMY_REMOTE_STATE === "true",
}

const apiEnv = apiEnvSchema.parse(process.env)
const remoteEnv =
  alchemyEnv.ALCHEMY_REMOTE_STATE ? RemoteEnvSchema.parse(process.env) : null

const app = await alchemy("juxtapose", {
  password: alchemyEnv.ALCHEMY_PASSWORD,
  stage: alchemyEnv.ALCHEMY_STAGE,
  stateStore: (scope: Scope) =>
    remoteEnv ?
      new CloudflareStateStore(scope)
    : new FileSystemStateStore(scope),
})

await Exec("db-generate", {
  command: "pnpm run db:generate",
})

const db = await D1Database("db", {
  migrationsDir: "./migrations/",
})

export const api = await Worker("api", {
  cwd: "./apps/api",
  entrypoint: "./src/main.ts",
  compatibility: "node",
  domains: remoteEnv ? [remoteEnv.API_DOMAIN] : [],
  bindings: {
    DB: db,
    API_CORS_ORIGIN: apiEnv.API_CORS_ORIGIN,
    API_BETTER_AUTH_SECRET: alchemy.secret(apiEnv.API_BETTER_AUTH_SECRET),
    API_BETTER_AUTH_URL: apiEnv.API_BETTER_AUTH_URL,
    API_GITHUB_CLIENT_ID: apiEnv.API_GITHUB_CLIENT_ID,
    API_GITHUB_CLIENT_SECRET: alchemy.secret(apiEnv.API_GITHUB_CLIENT_SECRET),
  },
})

export const web = await TanStackStart("web", {
  cwd: "./apps/web",
  compatibility: "node",
  domains: remoteEnv ? [remoteEnv.WEB_DOMAIN] : [],
})

console.log(`Web -> ${web.url}`)
console.log(`API -> ${api.url}`)

await app.finalize()
