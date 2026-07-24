import { Link, useLocation } from "react-router"
import { Clock3, ShieldCheck } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

type PendingLocationState = {
  name?: string
}

export default function Pending() {
  const location = useLocation()
  const state = (location.state ?? {}) as PendingLocationState

  if (!state.name) {
    return (
      <main className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
        <Card className="w-full max-w-md">
          <CardHeader className="justify-items-center text-center">
            <CardTitle className="text-xl">프로필 검토</CardTitle>
            <CardDescription>
              프로필 설정을 완료한 후 이 페이지를 방문할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link to="/setup">프로필 설정하기</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader className="justify-items-center text-center">
          <div className="bg-primary/10 text-primary mb-3 flex size-14 items-center justify-center rounded-full">
            <Clock3 className="size-7" />
          </div>
          <CardTitle className="text-xl">프로필을 검토하고 있습니다</CardTitle>
          <CardDescription>
            {state.name}님의 프로필 설정이 완료되었습니다. 관리자가 입력한 정보를 검토할 예정입니다.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="bg-muted/60 flex flex-col gap-3 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <p className="text-muted-foreground text-sm">
                관리자가 프로필을 승인한 후 KMLA Online을 이용할 수 있습니다.
              </p>
            </div>
          </div>
        </CardContent>

        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link to="/setup">프로필 설정 목업으로 돌아가기</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
