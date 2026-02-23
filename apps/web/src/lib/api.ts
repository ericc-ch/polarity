import { env } from "./env"

// Simple typed fetch client since Hono client types aren't resolving across workspace boundary
interface ApiClient {
  repositories: {
    $get: () => Promise<Response>
    $post: (options: { json: { repoUrl: string } }) => Promise<Response>
  }
}

function createClient(baseUrl: string): ApiClient {
  const request = (path: string, options?: RequestInit) =>
    fetch(`${baseUrl}${path}`, { ...options, credentials: "include" })

  return {
    repositories: {
      $get: () => request("/repositories"),
      $post: ({ json }) =>
        request("/repositories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        }),
    },
  }
}

export const apiClient = createClient(`${env.VITE_API_URL}/api`)
export type { ApiClient }
