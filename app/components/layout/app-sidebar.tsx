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

export function AppSidebar() {
  const location = useLocation()
  const year = new Date().getFullYear()

  return (
    <Sidebar variant="floating" collapsible="icon" className="md:top-14 md:h-[calc(100svh-3.5rem)]">
      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-5 pt-6">
              {appNavItems.map((item) => {
                const isActive = isAppNavItemActive(location.pathname, item)

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className="text-sidebar-foreground flex items-center gap-3"
                      >
                        <item.icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
                        <span className="overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200 md:group-data-[collapsible=icon]:max-w-0 md:group-data-[collapsible=icon]:-translate-x-1 md:group-data-[collapsible=icon]:opacity-0 md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:max-w-32 md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:translate-x-0 md:group-data-[collapsible=icon]:group-data-[hovered=true]/sidebar:opacity-100">
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
