import { apiClient } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import type { Repository } from "shared"

export const Route = createFileRoute("/_layout/repos/$owner/$repo")({
  component: RepoDetailsPage,
})

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp || timestamp === 0) return "Never"
  const hours = (Date.now() - timestamp) / (1000 * 60 * 60)
  return new Intl.RelativeTimeFormat("en").format(-Math.round(hours), "hour")
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function RepoDetailsPage() {
  const { owner, repo } = Route.useParams()
  const queryClient = useQueryClient()

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.api.repositories[":owner"][":repo"].sync.$post({
        param: { owner, repo },
      })
      if (!res.ok) {
        throw new Error("Failed to sync repository")
      }
      return res.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["repository", owner, repo],
      })
    },
  })

  const {
    data: repoData,
    isLoading,
    error,
  } = useQuery<Repository>({
    queryKey: ["repository", owner, repo],
    queryFn: async () => {
      const res = await apiClient.api.repositories[":owner"][":repo"].$get({
        param: { owner, repo },
      })
      if (res.status === 404) {
        throw notFound()
      }
      if (!res.ok) {
        throw new Error("Failed to fetch repository")
      }
      return res.json()
    },
  })

  if (isLoading) {
    return <div className="text-muted-foreground py-8 text-center">Loading repository...</div>
  }

  if (error || !repoData) {
    return <div className="text-destructive py-8 text-center">Failed to load repository</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <Link to="/" className="text-muted-foreground hover:text-foreground text-sm">
          ← Back to repositories
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        <h1 className="font-mono text-2xl font-semibold">
          {repoData.owner}/{repoData.repo}
        </h1>

        <div className="grid gap-4 rounded-lg border p-4">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last synced</span>
            <span>{formatRelativeTime(repoData.lastSyncAt)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span>{formatDate(repoData.createdAt)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted-foreground">Updated</span>
            <span>{formatDate(repoData.updatedAt)}</span>
          </div>
        </div>

        <Button
          className="w-full"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? "Syncing..." : "Update repo"}
        </Button>
      </div>
    </div>
  )
}
