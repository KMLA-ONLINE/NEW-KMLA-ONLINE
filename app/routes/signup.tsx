import { useEffect, useState } from "react"
import { useFetcher, useNavigate, type ActionFunctionArgs } from "react-router"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "~/lib/supabase/server"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"
import { Input } from "~/components/ui/input"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase } = createClient(request)

  const formData = await request.formData()
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" }
  }

  const { error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return {
      error: error instanceof Error ? error.message : "An error occurred",
    }
  }

  return { success: true }
}

export default function Signup() {
  const fetcher = useFetcher<typeof action>()
  const navigate = useNavigate()

  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const error = fetcher.data?.error
  const loading = fetcher.state === "submitting"

  useEffect(() => {
    if (fetcher.data?.success) {
      toast.success("Account created successfully!")
      setTimeout(() => navigate("/login"), 1500)
    }
  }, [fetcher.data, navigate])

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Create an account</CardTitle>
              <CardDescription>Enter your email and password to sign up</CardDescription>
            </CardHeader>
            <CardContent>
              <fetcher.Form
                method="post"
                onSubmit={(e) => {
                  const form = e.currentTarget
                  const pw = (form.elements.namedItem("password") as HTMLInputElement).value
                  const confirm = (form.elements.namedItem("confirmPassword") as HTMLInputElement)
                    .value
                  if (pw !== confirm) {
                    e.preventDefault()
                    toast.error("Passwords do not match")
                  }
                }}
              >
                <div className="flex flex-col gap-6">
                  {error && <p className="text-destructive text-sm">{error}</p>}
                  <div className="flex flex-col gap-2">
                    <Input name="email" type="email" placeholder="Email" required />
                    <div className="relative">
                      <Input
                        name="password"
                        type={showPw ? "text" : "password"}
                        placeholder="Password"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-3"
                      >
                        {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        name="confirmPassword"
                        type={showConfirm ? "text" : "password"}
                        placeholder="Confirm password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-3"
                      >
                        {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating account..." : "Sign up"}
                  </Button>
                </div>
              </fetcher.Form>
              <p className="text-muted-foreground mt-4 text-center text-sm">
                Already have an account?{" "}
                <a href="/login" className="text-primary underline underline-offset-4">
                  Login
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
