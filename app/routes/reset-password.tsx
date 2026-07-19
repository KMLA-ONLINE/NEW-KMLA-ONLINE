import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { AlertTriangle, Loader2 } from "lucide-react"

import { rotateVault } from "~/lib/crypto/vault"
import { createClient } from "~/lib/supabase/client"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

type Session = { authUserId: string; email: string }

/**
 * 비밀번호 재설정의 2단계. 메일 링크가 이 페이지로 떨어뜨린다.
 *
 * 보통의 앱이라면 여기서 새 비밀번호만 받으면 끝이다. 종단간 암호화에서는 그럴 수 없다:
 * 메일 링크는 Supabase Auth에 대고 "이 메일함의 주인이다"를 증명할 뿐이고, 금고는 서버가
 * 열쇠를 갖고 있지 않아서 그 증명으로 열리지 않는다.
 *
 * 비밀번호를 아는 사람은 애초에 여기 오지 않고 로그인 후 비밀번호 변경(menu/password)을
 * 쓴다 -- 그 경로는 지난 대화를 지킨다. 여기 온 사람은 비밀번호를 **잊은** 사람이라 옛 금고를
 * 열 방법이 없으므로, 신원키까지 새로 만들어 계정을 되찾되 **지난 1:1 대화는 포기한다.** 우회로를
 * 만들 수 있다면 그건 서버가 읽을 수 있다는 뜻이므로, 이건 고칠 버그가 아니다.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 브라우저 클라이언트가 URL의 코드를 세션으로 교환한다(detectSessionInUrl). 서버는 그
  // 교환에 관여하지 않으므로 세션은 하이드레이션 이후에야 존재한다.
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
    const password = String(form.get("password") ?? "")
    const confirmPassword = String(form.get("confirmPassword") ?? "")

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
    // Argon2id가 메인 스레드를 붙잡는다. 한 번 양보해야 로딩 상태가 그려진다.
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      const db = createClient()
      await rotateVault(db, session.authUserId, password, session.email)
      navigate("/")
    } catch {
      setError("재설정에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setLoading(false)
    }
  }

  if (session === undefined) {
    return (
      <div className="flex min-h-svh w-full items-center justify-center p-4">
        <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden="true" />
      </div>
    )
  }

  if (session === null) {
    return (
      <Shell title="링크가 만료되었습니다" subtitle="재설정 링크를 다시 받아 주세요.">
        <Button asChild className="h-10 w-full">
          <Link to="/forgot-password">재설정 링크 다시 받기</Link>
        </Button>
      </Shell>
    )
  }

  return (
    <Shell title="새 비밀번호 설정" subtitle={session.email}>
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

        <div className="border-destructive/40 bg-destructive/5 flex gap-2.5 rounded-lg border p-3">
          <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-muted-foreground text-sm leading-relaxed">
            비밀번호를 잊어 재설정하면 지난 1:1 대화는{" "}
            <strong className="text-foreground font-medium">영구히 열 수 없게 됩니다.</strong> 새
            대화는 정상적으로 만들 수 있습니다.
          </p>
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
            placeholder="비밀번호를 다시 입력하세요"
            autoComplete="new-password"
            required
            className="h-10"
          />
        </div>

        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
          {loading ? "설정 중..." : "비밀번호 변경"}
        </Button>
      </form>
    </Shell>
  )
}

function Shell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-8">
          <div className="text-center">
            <p className="text-foreground text-2xl font-bold tracking-tight">{title}</p>
            <p className="text-muted-foreground mt-1.5 text-sm break-all">{subtitle}</p>
          </div>
          <div className="bg-card text-card-foreground rounded-xl border shadow-xs">
            <div className="p-6 md:p-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
