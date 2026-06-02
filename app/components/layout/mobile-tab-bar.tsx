import { NavLink, useLocation } from "react-router"

import { appNavItems, isAppNavItemActive } from "~/components/layout/app-nav-items"
import { cn } from "~/lib/utils"

export function MobileTabBar() {
  const location = useLocation()

  return (
    <nav
      aria-label="Primary navigation"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid h-16 grid-cols-5">
        {appNavItems.map((item) => {
          const isActive = isAppNavItemActive(location.pathname, item)

          return (
            <li key={item.to} className="min-w-0">
              <NavLink
                to={item.to}
                end={item.end}
                className={cn(
                  "text-muted-foreground flex h-full w-full items-center justify-center px-1",
                  isActive && "text-primary"
                )}
              >
                <item.icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
