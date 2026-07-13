import { ChevronLeftIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router"

// 메뉴 하위 화면들의 머리. 모바일에선 탭바의 "메뉴"가 이미 활성이라(pathname.startsWith) 돌아갈
// 곳이 어디인지 화면 안에서도 말해 준다.
export function MenuSubHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Link
        to="/menu"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        메뉴
      </Link>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {aside}
      </div>
    </div>
  )
}
