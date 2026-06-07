import { Link } from "react-router"
import { MailQuestion } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

export default function ForgotPassword() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader className="justify-items-center text-center">
          <div className="bg-primary/10 text-primary mb-3 flex size-14 items-center justify-center rounded-full">
            <MailQuestion className="size-7" />
          </div>
          <CardTitle className="text-xl">비밀번호를 잊으셨나요?</CardTitle>
          <CardDescription>
            비밀번호 재설정 기능은 현재 준비 중입니다. 관리자에게 문의해 주세요.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="bg-muted/60 flex flex-col gap-3 rounded-lg p-4">
            <p className="text-muted-foreground text-sm leading-relaxed">
              KMLA Online 계정의 비밀번호를 재설정하려면 시스템 관리자에게 연락하시기 바랍니다.
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              학번과 이름을 함께 알려주시면 확인 후 도움을 드릴 수 있습니다.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-2">
          <Button asChild variant="default" className="w-full">
            <Link to="/login">로그인으로 돌아가기</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
