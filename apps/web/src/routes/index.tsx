import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { auth } from "@/lib/auth"
import { createFileRoute } from "@tanstack/react-router"
import { LogIn, LogOut } from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/" as unknown as undefined)({
  component: Home,
})

interface GitHubRepo {
  name: string
  description: string
  stars: number
}

const topRepos: GitHubRepo[] = [
  {
    name: "facebook/react",
    description: "A declarative, efficient, and flexible JavaScript library",
    stars: 230000,
  },
  {
    name: "microsoft/vscode",
    description: "Visual Studio Code - open source code editor",
    stars: 160000,
  },
  {
    name: "vercel/next.js",
    description: "The React Framework for the Web",
    stars: 120000,
  },
]

function SearchBar() {
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<GitHubRepo[]>(topRepos)

  const handleSearch = async (query: string) => {
    setSearchQuery(query)

    if (query.length < 2) {
      setResults(topRepos)
      return
    }

    setIsLoading(true)

    setTimeout(() => {
      const mockResults: GitHubRepo[] = [
        {
          name: `${query}/awesome-project`,
          description: "An awesome project built with React",
          stars: 1234,
        },
        {
          name: `org/${query}-starter`,
          description: "A starter template for beginners",
          stars: 567,
        },
        {
          name: `user/${query}-toolkit`,
          description: "A toolkit for developers",
          stars: 890,
        },
      ]
      setResults(mockResults)
      setIsLoading(false)
    }, 300)
  }

  const handleSelect = (repo: GitHubRepo) => {
    console.log("Selected repo:", repo.name)
    setSearchQuery("")
    setResults([])
  }

  return (
    <div className="mx-auto w-[min(100%,var(--container-lg))]">
      <Combobox
        items={results}
        itemToStringValue={(item) => (item as GitHubRepo).name}
      >
        <ComboboxInput
          placeholder="Search for GitHub repos..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="h-14 text-base"
          showTrigger={false}
        ></ComboboxInput>
        <ComboboxContent className="w-full">
          {isLoading && (
            <div className="text-muted-foreground py-4 text-center text-sm">
              Searching...
            </div>
          )}
          {!isLoading && results.length === 0 && searchQuery.length >= 2 && (
            <ComboboxEmpty>No repositories found.</ComboboxEmpty>
          )}
          {!isLoading && results.length > 0 && (
            <>
              <ComboboxList>
                {(item: unknown) => {
                  const repo = item as GitHubRepo
                  return (
                    <ComboboxItem
                      key={repo.name}
                      value={repo}
                      onSelect={() => handleSelect(repo)}
                    >
                      <div className="flex flex-col gap-1 py-1">
                        <span className="font-medium">{repo.name}</span>
                        <span className="text-muted-foreground text-sm">
                          {repo.description}
                        </span>
                      </div>
                    </ComboboxItem>
                  )
                }}
              </ComboboxList>
            </>
          )}
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

function NavBar() {
  const session = auth.useSession()
  const user = session.data?.user

  return (
    <nav className="sticky top-0 flex items-center p-4">
      {user ?
        <Button
          variant="ghost"
          size="sm"
          onClick={() => auth.signOut()}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      : <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            auth.signIn.social({
              provider: "github",
              callbackURL: window.location.href,
            })
          }
          className="text-muted-foreground hover:text-foreground"
        >
          <LogIn className="mr-2 h-4 w-4" />
          Sign in
        </Button>
      }
    </nav>
  )
}

function Home() {
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr]">
      <NavBar />

      <main className="flex items-center justify-center">
        <SearchBar />
      </main>
    </div>
  )
}
