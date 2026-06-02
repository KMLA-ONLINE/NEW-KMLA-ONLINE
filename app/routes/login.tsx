import { useState } from "react"
import { redirect, useFetcher, type ActionFunctionArgs } from "react-router"
import { Eye, EyeOff } from "lucide-react"

import { createClient } from "~/lib/supabase/server"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Input } from "~/components/ui/input"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase } = createClient(request)

  const formData = await request.formData()
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return {
      error: error instanceof Error ? error.message : "An error occurred",
    }
  }

  return redirect("/")
}

export default function Login() {
  const fetcher = useFetcher<typeof action>()
  const [showPw, setShowPw] = useState(false)

  const error = fetcher.data?.error
  const loading = fetcher.state === "submitting"

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Welcome!</CardTitle>
              <CardDescription>Login to your account to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <fetcher.Form method="post">
                <div className="flex flex-col gap-6">
                  {error && <p className="text-destructive-500 text-sm">{error}</p>}
                  <div className="flex flex-col gap-2">
                    <Input name="email" type="email" placeholder="Email" required />
                    <div className="relative">
                      <Input
                        name="password"
                        type={showPw ? "text" : "password"}
                        placeholder="Password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-3"
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Logging in..." : "Login"}
                  </Button>
                </div>
              </fetcher.Form>
              <p className="text-muted-foreground mt-4 text-center text-sm">
                Don&apos;t have an account?{" "}
                <a href="/signup" className="text-primary underline underline-offset-4">
                  Sign up
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
