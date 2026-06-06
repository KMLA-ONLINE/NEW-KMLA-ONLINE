import { useEffect, useRef, useState } from "react"
import { redirect, useFetcher, type ActionFunctionArgs } from "react-router"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { createClient } from "~/lib/supabase/server"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase } = createClient(request)

  const formData = await request.formData()
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: "이메일 또는 비밀번호를 확인해 주세요." }
  }

  return redirect("/")
}

export default function Login() {
  const fetcher = useFetcher<typeof action>()
  const [showPw, setShowPw] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const error = fetcher.data?.error
  const loading = fetcher.state === "submitting"

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-8">
          <div className="text-center">
            <p className="text-foreground text-2xl font-bold tracking-tight">KMLA Online</p>
            <p className="text-muted-foreground mt-1.5 text-sm">계정에 로그인하세요</p>
          </div>

          <div className="bg-card text-card-foreground rounded-xl border shadow-xs">
            <div className="p-6 md:p-8">
              <fetcher.Form method="post" className="flex flex-col gap-5">
                {error && (
                  <p className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm font-medium">
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email" className="text-sm font-medium">
                    이메일
                  </Label>
                  <Input
                    ref={emailRef}
                    id="email"
                    name="email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    required
                    className="h-10"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">
                      비밀번호
                    </Label>
                    <a
                      href="#"
                      className="text-primary hover:text-primary/80 text-xs font-medium underline-offset-2 hover:underline"
                    >
                      비밀번호 찾기
                    </a>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      placeholder="비밀번호를 입력하세요"
                      autoComplete="current-password"
                      required
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      tabIndex={-1}
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-3 transition-colors"
                    >
                      {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="h-10 w-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  {loading ? "로그인 중..." : "로그인"}
                </Button>
              </fetcher.Form>

              <p className="text-muted-foreground mt-6 text-center text-sm">
                아직 계정이 없으신가요?{" "}
                <a
                  href="/signup"
                  className="text-primary hover:text-primary/80 font-medium underline-offset-2 hover:underline"
                >
                  회원가입
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
