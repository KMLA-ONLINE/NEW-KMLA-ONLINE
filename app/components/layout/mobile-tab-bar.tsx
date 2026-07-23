import { NavLink, useLocation } from "react-router"

import { appNavItems, isAppNavItemActive } from "~/components/layout/app-nav-items"
import { NavBadge } from "~/components/layout/nav-badge"
import { useNavBadges } from "~/components/layout/use-nav-badges"
import { cn } from "~/lib/utils"

export function MobileTabBar() {
  const location = useLocation()
  const badges = useNavBadges()

  return (
    <nav
      aria-label="주요 메뉴"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid h-16 grid-cols-5">
        {appNavItems.map((item) => {
          const isActive = isAppNavItemActive(location.pathname, item)
          const unread = badges[item.to] ?? 0

          return (
            <li key={item.to} className="min-w-0">
              {/* Prefetch on touch-down, which buys the tap-to-click delay. Worth
                  it before any of these routes has a loader, because it also warms
                  the route's code-split chunk. */}
              {/* 탭바는 아이콘만 그려서 링크에 읽을 텍스트가 없다 -- 라벨을 접근성 이름으로 붙이고,
                  안 읽은 게 있으면 개수까지 이름에 담는다(뱃지 자체는 aria-hidden). */}
              <NavLink
                to={item.to}
                end={item.end}
                prefetch="intent"
                aria-label={unread > 0 ? `${item.label} (안 읽음 ${unread}개)` : item.label}
                className={cn(
                  "text-muted-foreground flex h-full w-full items-center justify-center px-1",
                  isActive && "text-primary"
                )}
              >
                <span className="relative flex shrink-0">
                  <item.icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
                  <NavBadge count={unread} className="ring-background" />
                </span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
