import { embedMany } from "ai"
import { ollama } from "ollama-ai-provider-v2"
import type { Issue, PullRequest } from "../routes/repositories/queries.js"

export function prepIssue(issue: Issue): string {
  return issue.title + "\n\n" + issue.bodyText
}

export function prepPullRequest(pullRequest: PullRequest): string {
  const filePaths = pullRequest.files.nodes.map((f) => f.path)
  return pullRequest.title + "\n\n" + pullRequest.bodyText + "\n\n" + filePaths.join("\n")
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const model = ollama.embedding("embeddinggemma")
  const result = await embedMany({
    model,
    values: texts,
  })
  return result.embeddings
}
