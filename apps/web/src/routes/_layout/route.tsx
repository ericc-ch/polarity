import { Outlet, createFileRoute, Link } from "@tanstack/react-router"
import { Button, buttonVariants } from "@/components/ui/button"
import { auth } from "@/lib/auth"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_layout")({
  component: LayoutComponent,
})

function LayoutComponent() {
  const session = auth.useSession()
  const user = session.data?.user

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr]">
      <header className="sticky top-0 px-4">
        <nav className="mx-auto flex h-12 max-w-3xl items-center justify-between">
          <Link
            to="/"
            className="text-foreground font-mono text-sm font-medium"
          >
            polarity
          </Link>

          <div className="flex items-center gap-2">
            <Link
              to="/submit"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Submit repo
            </Link>

            {user ?
              <Button variant="outline" onClick={() => auth.signOut()}>
                Sign out
              </Button>
            : <Button
                onClick={() =>
                  auth.signIn.social({
                    provider: "github",
                    callbackURL: window.location.href,
                  })
                }
              >
                Sign in
              </Button>
            }
          </div>
        </nav>
      </header>

      <main className="px-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
