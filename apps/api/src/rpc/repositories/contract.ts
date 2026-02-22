import { Rpc, RpcGroup } from "@effect/rpc"
import { Schema } from "effect"
import { Repository } from "shared/schema"
import { UnauthorizedError, ValidationError } from "../errors"

export class RepositoriesRpcGroup extends RpcGroup.make(
  Rpc.make("RepositoryList", {
    payload: Schema.Struct({}),
    success: Schema.Array(Repository),
    error: UnauthorizedError,
  }),
  Rpc.make("RepositorySubmit", {
    payload: Schema.Struct({ repoUrl: Schema.String }),
    success: Repository,
    error: Schema.Union(ValidationError, UnauthorizedError),
  }),
) {}
