import { useEffect, useState, type FormEvent } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { useNavigate } from "react-router"

import { MenuSubHeader } from "~/components/menu/menu-sub-header"
import { WrongPasswordError } from "~/lib/crypto/account"
import { changeVaultPassword } from "~/lib/crypto/vault"
import { createClient } from "~/lib/supabase/client"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

type Session = { authUserId: string; email: string }

/**
 * 로그인 상태에서 비밀번호를 바꾼다. login/signup과 같은 이유로 브라우저에서 돈다:
 * 비밀번호가 어떤 서버도 지나가면 안 된다. SPA라 서버 action이라는 선택지 자체가 없다.
 *
 * forgot/reset-password(비밀번호를 잊었을 때)와 다르다. 여기 오는 사람은 비밀번호를 **아는**
 * 사람이라, 현재 비밀번호로 금고를 열어 새 비밀번호로 다시 봉인만 한다 -- 신원키는 그대로라
 * 지난 대화가 전부 살아남는다. 잊은 사람의 경로는 신원키를 갈아엎어 지난 대화를 포기한다.
 */
export default function ProfilePasswordPage() {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) =>
        setSession(data.user?.email ? { authUserId: data.user.id, email: data.user.email } : null)
      )
      .catch(() => setSession(null))
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session) return

    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get("currentPassword") ?? "")
    const password = String(form.get("password") ?? "")
    const confirmPassword = String(form.get("confirmPassword") ?? "")

    if (password !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.")
      return
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.")
      return
    }

    setError(null)
    setLoading(true)
    // Argon2id가 메인 스레드를 붙잡는다. 현재 비번 확인과 새 봉인에서 두 번 돈다. 한 번 양보해야
    // 로딩 상태가 그려진다.
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      await changeVaultPassword(
        createClient(),
        session.authUserId,
        currentPassword,
        password,
        session.email
      )
      setDone(true)
    } catch (caught) {
      setError(
        caught instanceof WrongPasswordError
          ? "현재 비밀번호가 올바르지 않습니다."
          : "변경에 실패했습니다. 잠시 후 다시 시도해 주세요."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <MenuSubHeader title="비밀번호 변경" />

      <Card className="border-border/70 shadow-xs">
        {/* 제목은 MenuSubHeader가 이미 이고 있다. 카드에 또 달면 같은 말이 두 번 뜬다. */}
        <CardHeader>
          <CardDescription>현재 비밀번호로 확인한 뒤 새 비밀번호로 바꿉니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
                <CheckCircle2 className="size-7" aria-hidden="true" />
              </div>
              <p className="text-foreground text-sm font-medium">비밀번호가 변경되었습니다.</p>
              <Button onClick={() => navigate("/menu")} className="h-10 w-full">
                메뉴로 돌아가기
              </Button>
            </div>
          ) : session === undefined ? (
            <div className="flex justify-center py-6">
              <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden="true" />
            </div>
          ) : session === null ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              세션이 만료되었습니다. 다시 로그인해 주세요.
            </p>
          ) : (
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
                <Label htmlFor="currentPassword" className="text-sm font-medium">
                  현재 비밀번호
                </Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-10"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  새 비밀번호
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="6자 이상 입력하세요"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="h-10"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  새 비밀번호 확인
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="h-10"
                />
              </div>

              <Button type="submit" className="h-10 w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                {loading ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
