import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { auth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { createFileRoute } from "@tanstack/react-router"
import {
  AlertCircle,
  Check,
  Clock,
  GitBranch,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Star,
  Terminal,
  X,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"

export const Route = createFileRoute("/" as unknown as undefined)({
  component: Home,
})

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type RepositoryStatus =
  | "pending"
  | "backfilling"
  | "syncing"
  | "active"
  | "error"

interface Repository {
  id: string
  fullName: string
  description: string
  status: RepositoryStatus
  stars: number
  lastSyncAt: number | null
  errorMessage?: string
  issuesCount: number
}

interface SearchResult {
  id: string
  fullName: string
  description: string
  status: RepositoryStatus
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_REPOS: Repository[] = [
  {
    id: "1",
    fullName: "facebook/react",
    description:
      "A declarative, efficient, and flexible JavaScript library for building user interfaces",
    status: "active",
    stars: 230000,
    lastSyncAt: Date.now() - 1000 * 60 * 5,
    issuesCount: 1247,
  },
  {
    id: "2",
    fullName: "microsoft/vscode",
    description: "Visual Studio Code - open source code editor",
    status: "syncing",
    stars: 160000,
    lastSyncAt: Date.now() - 1000 * 60 * 30,
    issuesCount: 5234,
  },
  {
    id: "3",
    fullName: "vercel/next.js",
    description: "The React Framework for the Web",
    status: "active",
    stars: 120000,
    lastSyncAt: Date.now() - 1000 * 60 * 60 * 2,
    issuesCount: 892,
  },
  {
    id: "4",
    fullName: "torvalds/linux",
    description: "Linux kernel source tree",
    status: "backfilling",
    stars: 180000,
    lastSyncAt: null,
    issuesCount: 0,
  },
  {
    id: "5",
    fullName: "rust-lang/rust",
    description: "Empowering everyone to build reliable and efficient software",
    status: "error",
    stars: 95000,
    lastSyncAt: Date.now() - 1000 * 60 * 60 * 24,
    errorMessage: "Rate limit exceeded. Retry in 15 minutes.",
    issuesCount: 8234,
  },
  {
    id: "6",
    fullName: "nodejs/node",
    description: "Node.js JavaScript runtime",
    status: "pending",
    stars: 105000,
    lastSyncAt: null,
    issuesCount: 1240,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return "Never"
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return num.toString()
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  errorMessage,
}: {
  status: RepositoryStatus
  errorMessage?: string | undefined
}) {
  const configs = {
    active: {
      icon: Check,
      label: "Indexed",
      className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
      dotClass: "bg-emerald-400",
    },
    backfilling: {
      icon: Loader2,
      label: "Indexing…",
      className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
      dotClass: "bg-amber-400 animate-pulse",
    },
    syncing: {
      icon: RefreshCw,
      label: "Syncing…",
      className: "text-amber-400 border-amber-400/30 bg-amber-400/10",
      dotClass: "bg-amber-400 animate-pulse",
    },
    error: {
      icon: AlertCircle,
      label: "Error",
      className: "text-red-400 border-red-400/30 bg-red-400/10",
      dotClass: "bg-red-400",
    },
    pending: {
      icon: Clock,
      label: "Pending",
      className:
        "text-muted-foreground border-muted-foreground/30 bg-muted-foreground/10",
      dotClass: "bg-muted-foreground",
    },
  }

  const config = configs[status]
  const Icon = config.icon

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-medium tracking-wider uppercase",
        config.className,
      )}
      title={errorMessage}
    >
      <span className={cn("size-1.5 rounded-full", config.dotClass)} />
      <Icon className="size-3" aria-hidden="true" />
      <span>{config.label}</span>
    </div>
  )
}

const RepoCard = memo(function RepoCard({ repo }: { repo: Repository }) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <Card
      className={cn(
        "group border-border bg-background/50 cursor-pointer transition-all duration-200",
        "hover:border-primary/50 hover:bg-muted/50",
        isHovered && "shadow-primary/5 translate-y-[-2px] shadow-lg",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="font-mono text-sm">
            <span className="text-muted-foreground">
              {repo.fullName.split("/")[0]}
            </span>
            <span className="text-muted-foreground/70">/</span>
            <span className="text-foreground">
              {repo.fullName.split("/")[1]}
            </span>
          </CardTitle>
          <StatusBadge status={repo.status} errorMessage={repo.errorMessage} />
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <CardDescription className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
          {repo.description || "No description available"}
        </CardDescription>
      </CardContent>
      <CardFooter className="border-border/50 text-muted-foreground/80 border-t pt-3 text-[10px]">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Star className="size-3" aria-hidden="true" />
              {formatNumber(repo.stars)}
            </span>
            <span className="flex items-center gap-1">
              <GitBranch className="size-3" aria-hidden="true" />
              {formatNumber(repo.issuesCount)}
            </span>
          </div>
          <span className="text-muted-foreground/70">
            {repo.lastSyncAt ?
              `Synced ${formatRelativeTime(repo.lastSyncAt)}`
            : "Queued"}
          </span>
        </div>
      </CardFooter>
    </Card>
  )
})

function HeroSearch({
  onSearch,
  isSearching,
}: {
  onSearch: (query: string) => void
  isSearching: boolean
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value)
      onSearch(value)

      if (value.length < 2) {
        setResults([])
        return
      }

      // Mock search with delay
      const filtered = MOCK_REPOS.filter((repo) =>
        repo.fullName.toLowerCase().includes(value.toLowerCase()),
      ).map((repo) => ({
        id: repo.id,
        fullName: repo.fullName,
        description: repo.description,
        status: repo.status,
      }))
      setResults(filtered)
    },
    [onSearch],
  )

  const handleSelect = useCallback((repo: SearchResult) => {
    console.log("Selected:", repo.fullName)
    setQuery("")
    setResults([])
    setIsOpen(false)
  }, [])

  return (
    <div className="relative">
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400/20 via-transparent to-cyan-400/20 opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-100" />
      <Combobox
        items={results}
        itemToStringValue={(item) => (item as SearchResult).fullName}
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <ComboboxInput
            placeholder="Search indexed repositories…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="border-border bg-background placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-primary/20 h-14 pr-32 pl-11 font-mono text-sm focus:ring-1"
            showTrigger={false}
          />
          <div className="text-muted-foreground/70 pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 items-center gap-1 text-xs sm:flex">
            <kbd className="border-border bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
              ⌘
            </kbd>
            <kbd className="border-border bg-muted rounded border px-1.5 py-0.5 font-mono text-[10px]">
              K
            </kbd>
          </div>
        </div>
        <ComboboxContent className="border-border bg-card">
          {isSearching && (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-xs">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              Searching…
            </div>
          )}
          {!isSearching && results.length === 0 && query.length >= 2 && (
            <ComboboxEmpty className="text-muted-foreground py-4 text-xs">
              No repositories found matching &ldquo;{query}&rdquo;
            </ComboboxEmpty>
          )}
          {!isSearching && results.length > 0 && (
            <ComboboxList>
              {(item: unknown) => {
                const repo = item as SearchResult
                return (
                  <ComboboxItem
                    key={repo.id}
                    value={repo}
                    onSelect={() => handleSelect(repo)}
                    className="border-border/50 hover:bg-muted border-b py-3 last:border-b-0"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-mono text-sm">
                          {repo.fullName}
                        </span>
                        <StatusBadge status={repo.status} />
                      </div>
                      <span className="text-muted-foreground line-clamp-1 text-xs">
                        {repo.description}
                      </span>
                    </div>
                  </ComboboxItem>
                )
              }}
            </ComboboxList>
          )}
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

function RepoSubmitForm({
  onSubmit,
}: {
  onSubmit: (repoName: string) => Promise<void>
}) {
  const [repoName, setRepoName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isValid = useMemo(() => {
    return /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repoName)
  }, [repoName])

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (!isValid || isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(false)

    try {
      await onSubmit(repoName)
      setSuccess(true)
      setRepoName("")
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit repository",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="border-border bg-background/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Plus className="text-primary size-4" aria-hidden="true" />
          <span>Add Repository</span>
        </CardTitle>
        <CardDescription className="text-muted-foreground text-xs">
          Submit a GitHub repository for vector indexing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
              <Input
                type="text"
                name="repoName"
                placeholder="owner/repo"
                value={repoName}
                onChange={(e) => {
                  setRepoName(e.target.value)
                  setError(null)
                }}
                className="border-border bg-background placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-primary/20 h-10 pl-10 font-mono text-sm focus:ring-1"
                spellCheck={false}
                autoComplete="off"
                aria-label="Repository name"
                aria-invalid={!!error || (repoName.length > 0 && !isValid)}
                aria-describedby={error ? "submit-error" : undefined}
              />
            </div>
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 h-10 disabled:opacity-50"
            >
              {isSubmitting ?
                <>
                  <Loader2
                    className="mr-1.5 size-3 animate-spin"
                    aria-hidden="true"
                  />
                  Submitting…
                </>
              : "Submit"}
            </Button>
          </div>

          {error && (
            <div
              id="submit-error"
              className="flex items-center gap-1.5 text-xs text-red-400"
              role="alert"
              aria-live="polite"
            >
              <X className="size-3" aria-hidden="true" />
              {error}
            </div>
          )}

          {success && (
            <div
              className="flex items-center gap-1.5 text-xs text-emerald-400"
              role="status"
              aria-live="polite"
            >
              <Check className="size-3" aria-hidden="true" />
              Repository queued for indexing
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function NavBar() {
  const session = auth.useSession()
  const user = session.data?.user

  return (
    <header className="border-border/50 bg-background/80 sticky top-0 z-50 border-b backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          {user ?
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground hidden text-xs sm:block">
                {user.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => auth.signOut()}
                className="border-border text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground h-8"
              >
                <LogOut className="mr-1.5 size-3.5" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          : <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                auth.signIn.social({
                  provider: "github",
                  callbackURL: window.location.href,
                })
              }
              className="border-border text-muted-foreground hover:border-muted-foreground/70 hover:text-foreground h-8"
            >
              <svg
                className="mr-1.5 size-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
              Sign in
            </Button>
          }
        </div>
      </div>
    </header>
  )
}

function RepoGrid({ repos }: { repos: Repository[] }) {
  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="border-border bg-muted/50 mb-4 flex h-12 w-12 items-center justify-center rounded-none border">
          <Search className="text-muted-foreground size-5" aria-hidden="true" />
        </div>
        <h3 className="text-muted-foreground font-mono text-sm">
          No repositories found
        </h3>
        <p className="text-muted-foreground/70 mt-1 text-xs">
          Try adjusting your search or add a new repository
        </p>
      </div>
    )
  }

  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="list"
      aria-label="Indexed repositories"
    >
      {repos.map((repo, index) => (
        <div
          key={repo.id}
          className="animate-fade-in"
          style={{
            animationDelay: `${index * 50}ms`,
            animationFillMode: "backwards",
          }}
          role="listitem"
        >
          <RepoCard repo={repo} />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function Home() {
  const [repos] = useState<Repository[]>(MOCK_REPOS)
  const [filteredRepos, setFilteredRepos] = useState<Repository[]>(MOCK_REPOS)
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = useCallback(
    (query: string) => {
      setIsSearching(true)

      // Debounced search simulation
      setTimeout(() => {
        if (query.length < 2) {
          setFilteredRepos(repos)
        } else {
          const filtered = repos.filter((repo) =>
            repo.fullName.toLowerCase().includes(query.toLowerCase()),
          )
          setFilteredRepos(filtered)
        }
        setIsSearching(false)
      }, 150)
    },
    [repos],
  )

  const handleSubmitRepo = useCallback(async (repoName: string) => {
    // Mock API call - TODO: Replace with real API
    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (repoName.includes("error")) {
          reject(new Error("Repository not found or access denied"))
        } else {
          resolve()
        }
      }, 1000)
    })
  }, [])

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        const searchInput = document.querySelector(
          '[placeholder="Search indexed repositories…"]',
        ) as HTMLInputElement
        searchInput?.focus()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr]">
      <NavBar />

      <main className="animate-fade-in px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-8">
          {/* Hero Section */}
          <section className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-foreground font-mono text-lg font-medium tracking-tight sm:text-xl">
                Explore Code Intelligence
              </h2>
              <p className="text-muted-foreground mx-auto max-w-md text-xs">
                Search semantically across indexed GitHub repositories. Query
                code, documentation, and issues with natural language.
              </p>
            </div>

            <div className="mx-auto max-w-2xl">
              <HeroSearch onSearch={handleSearch} isSearching={isSearching} />
            </div>
          </section>

          {/* Submit Form */}
          <section className="mx-auto max-w-2xl">
            <RepoSubmitForm onSubmit={handleSubmitRepo} />
          </section>

          {/* Repository Grid */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-wider uppercase">
                Indexed Repositories
              </h3>
              <span className="text-muted-foreground/70 text-[10px]">
                {filteredRepos.length} of {repos.length}
              </span>
            </div>

            <RepoGrid repos={filteredRepos} />
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-border/50 border-t px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 sm:flex-row">
          <p className="text-muted-foreground/70 text-[10px]">
            Code intelligence for the modern developer
          </p>
          <div className="text-muted-foreground/70 flex items-center gap-4 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              System operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
