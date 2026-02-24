import type { createAuth } from "./lib/auth"
import type { Database } from "./lib/db"

export type HonoContext = {
  Bindings: Env
  Variables: {
    db: Database
    auth: ReturnType<typeof createAuth>
  }
}
