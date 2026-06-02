import { HomeIcon, MenuIcon, UsersIcon, MessagesSquareIcon, ShapesIcon } from "lucide-react"
import type { ComponentType } from "react"

export type AppNavItem = {
  to: string
  label: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  end?: boolean
}

export const appNavItems: AppNavItem[] = [
  { to: "/", label: "Home", icon: HomeIcon, end: true },
  { to: "/groups", label: "Groups", icon: ShapesIcon },
  { to: "/community", label: "Community", icon: UsersIcon },
  { to: "/messenger", label: "Messenger", icon: MessagesSquareIcon },
  { to: "/menu", label: "Menu", icon: MenuIcon },
]

export function isAppNavItemActive(pathname: string, item: AppNavItem) {
  return item.end ? pathname === "/" : pathname.startsWith(item.to)
}
