import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { createClient } from "~/lib/supabase/client"
import { derivePasswordKeys } from "~/lib/crypto/account"
import { openVault } from "~/lib/crypto/vault"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

/**
 * 로그인은 브라우저에서 돈다. 그래야만 하는 이유가 하나 있다:
 * **비밀번호가 어떤 서버도 지나가면 안 된다.**
 *
 * SPA라 서버 action 자체가 없다 -- 있었다면 signInWithPassword를 거기서 부르는 순간 원문
 * 비밀번호가 브라우저 -> 우리 서버 -> Supabase 순으로 흘러, 우리가 모든 DM을 복호화할 수 있는
 * 키를 유도하게 되고 종단간 암호화는 겉보기에만 멀쩡한 연극이 된다.
 *
 * 그래서 브라우저에서 Argon2id를 돌려 masterKey를 만들고, 거기서 갈라낸 authHash만 Supabase
 * Auth에 보낸다. encKey는 같은 masterKey에서 나오지만 서버로 가지 않는다. HKDF의 두 출력은
 * 서로 독립이라, authHash를 손에 쥔 서버도 encKey를 재현할 수 없다. (docs/e2ee.md)
 */
export default function Login() {
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email") ?? "").trim()
    const password = String(form.get("password") ?? "")

    setError(null)
    setLoading(true)
    // Argon2id는 메인 스레드를 ~0.5초 붙잡는다. 여기서 한 번 양보하지 않으면 위에서 세운
    // 로딩 상태가 그려지지 않아, 버튼이 죽은 것처럼 보인다.
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      // 딱 한 번만 유도한다. authHash는 Supabase Auth로, encKey는 금고로 간다 -- 둘을 따로
      // 유도하면 Argon2id가 한 로그인에 두 번 돌아 화면이 두 배로 멈춘다.
      const keys = derivePasswordKeys(password, email)

      const db = createClient()
      const { data, error: authError } = await db.auth.signInWithPassword({
        email,
        password: keys.authHash,
      })

      if (authError || !data.user) {
        setError("이메일 또는 비밀번호를 확인해 주세요.")
        return
      }

      // 열쇠고리가 없으면 여기서 만든다(가입 도중 create_user_keys가 실패한 계정). 비밀번호가
      // 유일한 열쇠라 사용자에게 보여줄 것이 없다 -- 그대로 홈으로 보낸다.
      await openVault(db, data.user.id, keys)

      navigate("/")
    } catch {
      setError("로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.")
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
            <p className="text-muted-foreground mt-1.5 text-sm">계정에 로그인하세요</p>
          </div>

          <div className="bg-card text-card-foreground rounded-xl border shadow-xs">
            <div className="p-6 md:p-8">
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
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-sm font-medium">
                      비밀번호
                    </Label>
                    <Link
                      to="/forgot-password"
                      className="text-primary hover:text-primary/80 text-xs font-medium underline-offset-2 hover:underline"
                    >
                      비밀번호 찾기
                    </Link>
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

                <Button type="submit" className="h-10 w-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  {loading ? "로그인 중..." : "로그인"}
                </Button>
              </form>

              <p className="text-muted-foreground mt-6 text-center text-sm">
                아직 계정이 없으신가요?{" "}
                <Link
                  to="/signup"
                  className="text-primary hover:text-primary/80 font-medium underline-offset-2 hover:underline"
                >
                  회원가입
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
