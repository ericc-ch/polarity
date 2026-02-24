import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiClient } from "@/lib/api"
import { isValidGitHubRepoUrl } from "shared"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "@tanstack/react-form"
import { createFileRoute, Link } from "@tanstack/react-router"
import { z } from "zod"

const submitSchema = z.object({
  repoUrl: z
    .string()
    .min(1, "Repository URL is required")
    .refine(isValidGitHubRepoUrl, {
      message:
        "Enter a valid GitHub repository URL (e.g., https://github.com/owner/repo or owner/repo)",
    }),
})

type SubmitFormData = z.infer<typeof submitSchema>

export const Route = createFileRoute("/_layout/submit")({
  component: function Submit() {
    const queryClient = useQueryClient()

    const submitRepo = useMutation({
      mutationFn: async (repoUrl: string) => {
        const res = await apiClient.api.repositories.$post({
          json: { repoUrl },
        })
        if (!res.ok) {
          const error = await res.json()
          throw new Error(
            typeof error === "object" && error && "error" in error ?
              String(error.error)
            : "Failed to submit",
          )
        }
        return res.json()
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ["repositories"] })
      },
    })

    const form = useForm({
      defaultValues: {
        repoUrl: "",
      } as SubmitFormData,
      validators: {
        onSubmit: submitSchema,
      },
      onSubmit: async ({ value }) => {
        await submitRepo.mutateAsync(value.repoUrl)
      },
    })

    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void form.handleSubmit()
            }}
            className="flex flex-col gap-4"
          >
            <form.Field
              name="repoUrl"
              children={(field) => (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={field.name}>Repository URL</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="text"
                    placeholder="https://github.com/owner/repo"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={
                      field.state.meta.errors.length > 0 ? "true" : "false"
                    }
                    aria-describedby={
                      field.state.meta.errors.length > 0 ?
                        `${field.name}-error`
                      : undefined
                    }
                  />
                  {field.state.meta.errors.length > 0 ?
                    <p
                      id={`${field.name}-error`}
                      className="text-destructive text-xs"
                    >
                      {field.state.meta.errors[0]?.message}
                    </p>
                  : null}
                </div>
              )}
            />

            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <div className="flex flex-col gap-2">
                  <Button type="submit" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? "Submitting..." : "Submit Repository"}
                  </Button>
                  <Link
                    to="/"
                    className="text-muted-foreground hover:text-foreground text-center text-sm"
                  >
                    Back to home
                  </Link>
                </div>
              )}
            />
          </form>
        </div>
      </div>
    )
  },
})
