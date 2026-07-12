import { NavLink, useLocation } from "react-router"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar"
import { appNavItems, isAppNavItemActive } from "~/components/layout/app-nav-items"
import { NavBadge } from "~/components/layout/nav-badge"
import { useNavBadges } from "~/components/layout/use-nav-badges"

export function AppSidebar() {
  const location = useLocation()
  const badges = useNavBadges()
  const year = new Date().getFullYear()

  return (
    <Sidebar
      variant="sidebar"
      collapsible="icon"
      className="data-[side=left]:border-r-0 data-[side=left]:group-data-[hovered=true]/sidebar:border-r md:top-14 md:h-[calc(100svh-3.5rem)]"
    >
      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-5 pt-6">
              {appNavItems.map((item) => {
                const isActive = isAppNavItemActive(location.pathname, item)
                const unread = badges[item.to] ?? 0

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                    >
                      {/* Prefetch on hover or focus. Worth it before any of these
                          routes has a loader, because it also warms the route's
                          code-split chunk. */}
                      <NavLink
                        to={item.to}
                        end={item.end}
                        prefetch="intent"
                        aria-label={unread > 0 ? `${item.label} (안 읽음 ${unread}개)` : undefined}
                        className="text-sidebar-foreground flex items-center"
                      >
                        {/* 뱃지는 라벨이 아니라 아이콘에 얹는다 -- 아이콘만 남게 접혀도 보여야 하니까. */}
                        <span className="relative ml-0.5 flex shrink-0">
                          <item.icon className="size-5" strokeWidth={2} />
                          {/* 활성 항목은 뒤에 파란 알약이 깔려서 파란 뱃지가 묻힌다. 그때만 색을
                              반전시켜(흰 알약 + 파란 숫자) 알약에서 파낸 것처럼 보이게 한다. */}
                          <NavBadge
                            count={unread}
                            className={
                              isActive
                                ? "bg-sidebar text-sidebar-primary ring-sidebar-primary"
                                : "ring-sidebar"
                            }
                          />
                        </span>
                        <span className="ml-3 overflow-hidden whitespace-nowrap transition-[margin,max-width,opacity,transform] duration-200 ease-out md:group-data-[collapsible=icon]:ml-0 md:group-data-[collapsible=icon]:max-w-0 md:group-data-[collapsible=icon]:-translate-x-0.5 md:group-data-[collapsible=icon]:opacity-0 md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:ml-3 md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:max-w-32 md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:translate-x-0 md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:opacity-100">
                          {item.label}
                        </span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="text-muted-foreground overflow-hidden px-2 py-1 text-xs whitespace-nowrap transition-[max-width,opacity] duration-200 md:group-data-[collapsible=icon]:max-w-0 md:group-data-[collapsible=icon]:opacity-0 md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:max-w-full md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:opacity-100">
          © {year} from Dept. of SW &amp; Tech
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
