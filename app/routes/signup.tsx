import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { RecoveryCodeNotice } from "~/components/auth/recovery-code-notice"
import { createAccount } from "~/lib/crypto/account"
import { installVault } from "~/lib/crypto/vault"
import { createClient } from "~/lib/supabase/client"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

/**
 * 로그인과 같은 이유로 브라우저에서 돈다: 비밀번호가 우리 서버를 지나가면 안 된다.
 * 자세한 것은 ./login.tsx.
 *
 * 가입에서만 추가로 하는 일은 열쇠고리를 만드는 것이다. 하필 여기인 이유는, 지금이 브라우저가
 * 비밀번호를 들고 있는 유일한 순간이기 때문이다 -- 승인될 때까지 미루면 그때는 세션만 있고
 * 비밀번호가 없어서 encKey를 만들 방법이 없다.
 */
export default function Signup() {
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "").trim()
    const password = String(form.get("password") ?? "")
    const confirmPassword = String(form.get("confirmPassword") ?? "")

    // 다른 검증 실패와 같은 문(role=alert 배너)으로 보낸다. 이것만 토스트로 띄우면 몇 초 뒤
    // 사라져서, 스크린리더 사용자나 토스트를 놓친 사람에게는 왜 제출이 안 됐는지 알 단서가
    // 아무것도 남지 않는다.
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.")
      return
    }

    setError(null)
    setLoading(true)
    // Argon2id가 메인 스레드를 ~0.5초 붙잡는다. 한 번 양보해야 위에서 세운 로딩 상태가
    // 실제로 그려진다.
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      // 딱 한 번만 유도한다. authHash는 Supabase Auth로 가고, 나머지(encKey, userKey,
      // 신원키, 복구 코드)는 브라우저를 떠나지 않는다.
      const account = await createAccount(password, email)

      const db = createClient()
      const { data, error: authError } = await db.auth.signUp({
        email,
        password: account.authHash,
      })

      if (authError || !data.user) {
        setError("회원가입 중 오류가 발생했습니다. 입력한 정보를 확인해 주세요.")
        return
      }

      await installVault(db, data.user.id, account)
      setRecoveryCode(account.recoveryCode)
    } catch {
      setError("회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-8">
          <div className="text-center">
            <p className="text-foreground text-2xl font-bold tracking-tight">KMLA Online</p>
            <p className="text-muted-foreground mt-1.5 text-sm">
              {recoveryCode ? "거의 다 됐습니다" : "새 계정을 만드세요"}
            </p>
          </div>

          <div className="bg-card text-card-foreground rounded-xl border shadow-xs">
            <div className="p-6 md:p-8">
              {recoveryCode ? (
                // 이메일 확인이 꺼져 있어 signUp이 이미 세션을 줬고, on_auth_user_created가
                // status 'none'인 프로필을 만들어 뒀다. 남은 것은 온보딩뿐이다.
                <RecoveryCodeNotice
                  recoveryCode={recoveryCode}
                  continueLabel="프로필 설정하기"
                  onContinue={() => navigate("/setup")}
                />
              ) : (
                <>
                  {/* action이 없다: 이 폼은 절대 서버로 POST되지 않는다. 그게 요점이다. */}
                  <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
                  </form>

                  <p className="text-muted-foreground mt-6 text-center text-sm">
                    이미 계정이 있으신가요?{" "}
                    <Link
                      to="/login"
                      className="text-primary hover:text-primary/80 font-medium underline-offset-2 hover:underline"
                    >
                      로그인
                    </Link>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
