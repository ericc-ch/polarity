import { Input } from "@/components/ui/input"
import { RpcClientTag } from "@/lib/rpc"
import { useAtomValue, Result } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { useMemo, useState } from "react"

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp || timestamp === 0) return "Never"
  const hours = (Date.now() - timestamp) / (1000 * 60 * 60)
  return new Intl.RelativeTimeFormat("en").format(-Math.round(hours), "hour")
}

export const Route = createFileRoute("/_layout/")({
  component: function Home() {
    const [searchQuery, setSearchQuery] = useState("")
    const reposResult = useAtomValue(RpcClientTag.query("RepositoryList", {}))

    const filteredRepos = useMemo(() => {
      if (reposResult._tag !== "Success") return []
      const repos = reposResult.value
      if (!searchQuery.trim()) return repos
      const query = searchQuery.toLowerCase()
      return repos.filter((repo) => repo.fullName.toLowerCase().includes(query))
    }, [reposResult, searchQuery])

    return (
      <>
        <Input
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search repositories"
        />

        {Result.isFailure(reposResult) ?
          <div className="text-destructive">Failed to load repositories</div>
        : filteredRepos.map((repo) => (
            <div
              key={repo.fullName}
              className="flex items-center justify-between"
              role="listitem"
            >
              <div className="truncate font-mono text-sm">
                <span className="text-muted-foreground">
                  {repo.fullName.split("/")[0]}/
                </span>
                <span className="text-foreground">
                  {repo.fullName.split("/")[1]}
                </span>
              </div>

              <span className="w-20 text-right">
                {repo.lastSyncAt && repo.lastSyncAt > 0 ?
                  formatRelativeTime(repo.lastSyncAt)
                : "Queued"}
              </span>
            </div>
          ))
        }
      </>
    )
  },
})
