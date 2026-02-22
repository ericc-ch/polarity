import {
  HttpLayerRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import { RpcSerialization, RpcServer } from "@effect/rpc"
import { drizzle } from "drizzle-orm/d1"
import { Effect, Layer, Schema } from "effect"
import { schema } from "shared/schema"
import { Auth } from "./lib/auth/main"
import { Database } from "./lib/db"
import { EnvContext, EnvSchema } from "./lib/env"
import { BooksHandlers } from "./rpc/books/handler"
import { RootRpcGroup } from "./rpc/contract"
import { RepositoriesHandlers } from "./rpc/repositories/handler"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const EnvLive = Layer.effect(
      EnvContext,
      Schema.decodeUnknown(EnvSchema)(env),
    )
    const DatabaseLive = Layer.sync(Database, () => drizzle(env.DB, { schema }))
    const AuthLive = Auth.Default.pipe(Layer.provide(EnvLive))

    const HealthRoute = HttpLayerRouter.use((router) =>
      router.add(
        "GET",
        "/",
        HttpServerResponse.text("I'm FINE. Thanks for asking. Finally."),
      ),
    )

    const AuthRoutes = HttpLayerRouter.use(
      Effect.fn(function* (router) {
        const auth = yield* Auth

        yield* router.add(
          "*",
          "/api/auth/*",
          Effect.fn(function* (request) {
            const rawRequest = yield* HttpServerRequest.toWeb(request)
            const response = yield* Effect.promise(() =>
              auth.handler(rawRequest),
            )

            return yield* HttpServerResponse.fromWeb(response)
          }),
        )
      }),
    )

    const RpcRoutes = HttpLayerRouter.use(
      Effect.fn(function* (router) {
        const httpApp = yield* RpcServer.toHttpApp(RootRpcGroup)
        return yield* router.add("POST", "/rpc", httpApp)
      }),
    ).pipe(
      Layer.provide(RpcSerialization.layerJsonRpc()),
      Layer.provide(BooksHandlers),
      Layer.provide(RepositoriesHandlers),
    )

    const CorsLayer = Effect.gen(function* () {
      const { API_CORS_ORIGIN } = yield* EnvContext
      return HttpLayerRouter.cors({
        allowedOrigins: [API_CORS_ORIGIN.origin],
        credentials: true,
      })
    }).pipe(Layer.unwrapEffect, Layer.provide(EnvLive))

    const AppLive = Layer.mergeAll(HealthRoute, AuthRoutes, RpcRoutes).pipe(
      Layer.provide(AuthLive),
      Layer.provide(DatabaseLive),
      Layer.provide(CorsLayer),
    )

    const { handler } = HttpLayerRouter.toWebHandler(AppLive)

    return handler(request)
  },
}
