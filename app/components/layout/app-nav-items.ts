import { BellIcon, HomeIcon, MenuIcon, MessagesSquareIcon, ShapesIcon } from "lucide-react"
import type { ComponentType } from "react"

export type AppNavItem = {
  to: string
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  end?: boolean
}

// 사이드바(데스크톱)와 하단 탭바(모바일)가 같은 목록을 쓴다 -- 순서를 여기서 한 번만 바꾸면 둘 다 따라온다.
export const appNavItems: AppNavItem[] = [
  { to: "/", label: "홈", icon: HomeIcon, end: true },
  { to: "/messenger", label: "메시지", icon: MessagesSquareIcon },
  { to: "/groups", label: "그룹", icon: ShapesIcon },
  // 커뮤니티는 그룹의 "비공식" 탭으로 흡수돼서 이 자리는 알림이 됐다. 경로가 아직 /community인 건
  // 페이지 파일이 그대로라서다 -- 라우트 이름을 옮기는 건 별도 작업.
  { to: "/community", label: "알림", icon: BellIcon },
  { to: "/menu", label: "메뉴", icon: MenuIcon },
]

export function isAppNavItemActive(pathname: string, item: AppNavItem) {
  return item.end ? pathname === "/" : pathname.startsWith(item.to)
}
