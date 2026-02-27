import { prepPullRequest } from "./embedding"
import type { PullRequest } from "../routes/repositories/queries"

export async function hashPr(pullRequest: PullRequest) {
  const content = prepPullRequest(pullRequest)
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
