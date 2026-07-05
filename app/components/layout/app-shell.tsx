import { Outlet } from "react-router"

import { AppHeader } from "~/components/layout/app-header"
import { AppSidebar } from "~/components/layout/app-sidebar"
import { MobileTabBar } from "~/components/layout/mobile-tab-bar"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"

type AppShellProps = {
  email: string
}

export function AppShell({ email }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-svh w-full flex-1 flex-col md:h-svh md:overflow-hidden">
        <AppHeader email={email} />
        <div className="flex min-h-0 flex-1 pt-14">
          <AppSidebar />
          <SidebarInset className="min-h-0">
            <div className="flex flex-1 flex-col p-4 pb-24 sm:p-6 md:overflow-y-auto md:pb-6">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
        <MobileTabBar />
      </div>
    </SidebarProvider>
  )
}
