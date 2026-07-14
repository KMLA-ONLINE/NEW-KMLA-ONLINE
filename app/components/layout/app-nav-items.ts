import { BellIcon, HomeIcon, MenuIcon, MessagesSquareIcon, UsersRoundIcon } from "lucide-react"
import type { ComponentType } from "react"

export type AppNavItem = {
  to: string
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  end?: boolean
}

export const appNavItems: AppNavItem[] = [
  { to: "/", label: "홈", icon: HomeIcon, end: true },
  { to: "/messenger", label: "메시지", icon: MessagesSquareIcon },
  { to: "/groups", label: "그룹", icon: UsersRoundIcon },
  { to: "/noti", label: "알림", icon: BellIcon },
  { to: "/menu", label: "메뉴", icon: MenuIcon },
]

export function isAppNavItemActive(pathname: string, item: AppNavItem) {
  return item.end ? pathname === "/" : pathname.startsWith(item.to)
}
