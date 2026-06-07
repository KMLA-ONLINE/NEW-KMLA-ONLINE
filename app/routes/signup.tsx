import { useEffect, useRef, useState } from "react"
import { Link, useFetcher, useNavigate, type ActionFunctionArgs } from "react-router"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { createClient } from "~/lib/supabase/server"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase } = createClient(request)

  const formData = await request.formData()
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")

  if (password.length < 6) {
    return { error: "비밀번호는 6자 이상이어야 합니다." }
  }

  const { error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return { error: "회원가입 중 오류가 발생했습니다. 입력한 정보를 확인해 주세요." }
  }

  return { success: true }
}

export default function Signup() {
  const fetcher = useFetcher<typeof action>()
  const navigate = useNavigate()

  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  useEffect(() => {
    if (fetcher.data?.success) {
      toast.success("회원가입이 완료되었습니다.")
      setTimeout(() => navigate("/login"), 1500)
    }
  }, [fetcher.data, navigate])

  const error = fetcher.data?.error
  const loading = fetcher.state === "submitting"

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-8">
          <div className="text-center">
            <p className="text-foreground text-2xl font-bold tracking-tight">KMLA Online</p>
            <p className="text-muted-foreground mt-1.5 text-sm">새 계정을 만드세요</p>
          </div>

          <div className="bg-card text-card-foreground rounded-xl border shadow-xs">
            <div className="p-6 md:p-8">
              <fetcher.Form
                method="post"
                onSubmit={(e) => {
                  const form = e.currentTarget
                  const pw = (form.elements.namedItem("password") as HTMLInputElement).value
                  const confirm = (form.elements.namedItem("confirmPassword") as HTMLInputElement)
                    .value
                  if (pw !== confirm) {
                    e.preventDefault()
                    toast.error("비밀번호가 일치하지 않습니다.")
                  }
                }}
                className="flex flex-col gap-5"
              >
                {error && (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm font-medium"
                  >
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
                    spellCheck={false}
                    className="h-10"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password" className="text-sm font-medium">
                    비밀번호
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      placeholder="6자 이상 입력하세요"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-3 transition-colors"
                    >
                      {showPw ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    비밀번호 확인
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="비밀번호를 다시 입력하세요"
                      autoComplete="new-password"
                      required
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex items-center pr-3 transition-colors"
                    >
                      {showConfirm ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="h-10 w-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  {loading ? "계정 생성 중..." : "회원가입"}
                </Button>
              </fetcher.Form>

              <p className="text-muted-foreground mt-6 text-center text-sm">
                이미 계정이 있으신가요?{" "}
                <Link
                  to="/login"
                  className="text-primary hover:text-primary/80 font-medium underline-offset-2 hover:underline"
                >
                  로그인
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
