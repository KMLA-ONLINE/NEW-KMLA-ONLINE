import { FileQuestionMarkIcon, LockKeyholeIcon, RotateCcwIcon, ServerCrashIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"

type ErrorPageProps = {
  status?: number
  onRetry?: () => void
  stack?: string
}

const ERROR_CONTENT = {
  notFound: {
    code: "404 · 소재 불명",
    title: "찾으시는 페이지가 자습을 째고 사라졌어요.",
    description: "주소가 바뀌었거나, 페이지가 사라졌을 수 있어요.",
    Icon: FileQuestionMarkIcon,
  },
  forbidden: {
    code: "403 · 출입 제한",
    title: "이 구역은 관계자 외 출입 금지에요.",
    description: "이 페이지를 보려면 더 높은 권한이 필요해요.",
    Icon: LockKeyholeIcon,
  },
  unknown: {
    code: "오류",
    title: "서버가 잠깐 멍 때리는 중이에요.",
    description: "새로고침하면 정신을 차릴지도 몰라요.",
    Icon: ServerCrashIcon,
  },
} as const

export function ErrorPage({ status, onRetry, stack }: ErrorPageProps) {
  const content =
    status === 404
      ? ERROR_CONTENT.notFound
      : status === 401 || status === 403
        ? ERROR_CONTENT.forbidden
        : ERROR_CONTENT.unknown
  const { Icon } = content

  return (
    <main className="bg-background relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12">
      <div className="bg-primary/6 absolute -top-24 -left-24 size-72 rounded-full blur-3xl" />
      <div className="bg-muted absolute -right-28 -bottom-28 size-80 rounded-full blur-3xl" />

      <section className="relative w-full max-w-md text-center">
        <div className="relative mx-auto mb-7 h-40 w-52" aria-hidden="true">
          <div className="bg-card border-border absolute inset-x-3 top-5 h-28 rotate-[-5deg] rounded-xl border shadow-sm" />
          <div className="bg-card border-border absolute inset-x-3 top-5 flex h-28 rotate-[3deg] flex-col items-center justify-center rounded-xl border shadow-sm">
            <Icon className="text-primary mb-2 size-8" strokeWidth={1.7} />
            <span className="text-muted-foreground text-xs font-medium tracking-[0.18em]">
              {content.code}
            </span>
          </div>
        </div>

        <p className="text-primary mb-3 text-sm font-semibold">{content.code}</p>
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
          {content.title}
        </h1>
        <p className="text-muted-foreground mx-auto mt-3 max-w-sm text-sm leading-6">
          {content.description}
        </p>

        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild className="h-10">
            <Link to="/">홈으로 돌아가기</Link>
          </Button>
          {onRetry ? (
            <Button type="button" variant="outline" className="h-10" onClick={onRetry}>
              <RotateCcwIcon />
              다시 시도
            </Button>
          ) : null}
        </div>

        {stack ? (
          <pre className="bg-muted/60 text-muted-foreground mt-8 max-h-40 overflow-auto rounded-lg p-3 text-left text-xs whitespace-pre-wrap">
            <code>{stack}</code>
          </pre>
        ) : null}
      </section>
    </main>
  )
}
