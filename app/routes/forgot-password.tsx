import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link } from "react-router"
import { Loader2, MailCheck, MailQuestion } from "lucide-react"

import { createClient } from "~/lib/supabase/client"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

/**
 * 비밀번호 재설정의 1단계. 여기서는 메일만 보낸다.
 *
 * 종단간 암호화 때문에 이 흐름은 보통의 것보다 한 단계 길다. 메일 링크는 Supabase Auth에
 * "이 사람이 이 메일함의 주인이다"를 증명해 새 비밀번호를 세울 권한만 준다 -- 그것만으로는
 * 금고가 열리지 않는다. 금고를 여는 것은 여전히 복구 코드뿐이고, 그건 2단계
 * (/reset-password)에서 묻는다.
 *
 * 이 비대칭이 요점이다. 메일함을 장악한 공격자도(또는 Auth를 쥔 운영자도) 비밀번호를
 * 갈아치울 수는 있지만 지난 DM은 읽지 못한다. 복구 코드가 없기 때문이다.
 */
export default function ForgotPassword() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim()

    setError(null)
    setLoading(true)
    try {
      const { error: sendError } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      // 메일이 존재하는지 알려주지 않는다. 알려주면 그대로 계정 열거 도구가 된다.
      if (sendError && sendError.status !== 400) {
        setError("메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.")
        return
      }
      setSent(true)
    } catch {
      setError("메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader className="justify-items-center text-center">
          <div className="bg-primary/10 text-primary mb-3 flex size-14 items-center justify-center rounded-full">
            {sent ? <MailCheck className="size-7" /> : <MailQuestion className="size-7" />}
          </div>
          <CardTitle className="text-xl">
            {sent ? "메일을 확인해 주세요" : "비밀번호를 잊으셨나요?"}
          </CardTitle>
          <CardDescription>
            {sent
              ? "재설정 링크를 보냈습니다. 링크를 열면 복구 코드와 새 비밀번호를 입력하게 됩니다."
              : "가입한 이메일로 재설정 링크를 보내드립니다."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {sent ? (
            <div className="bg-muted/60 rounded-lg p-4">
              <p className="text-muted-foreground text-sm leading-relaxed">
                링크만으로는 지난 1:1 대화가 열리지 않습니다. 대화는 종단간 암호화되어 있어 서버가
                열쇠를 갖고 있지 않기 때문입니다 — 가입할 때 받은{" "}
                <strong className="text-foreground font-medium">복구 코드</strong>를 함께 준비해
                주세요.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

              <Button type="submit" className="h-10 w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                {loading ? "보내는 중..." : "재설정 링크 받기"}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-2">
          <Button asChild variant={sent ? "default" : "ghost"} className="w-full">
            <Link to="/login">로그인으로 돌아가기</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
