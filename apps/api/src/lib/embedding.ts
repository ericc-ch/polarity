import { embedMany } from "ai"
import { ollama } from "ollama-ai-provider-v2"

const model = ollama.embedding("embeddinggemma")

const result = await embedMany({
  model,
  values: ["Hello", "World"],
})

console.log(result)
