import { Outlet, useMatches } from "react-router"

import { AppHeader } from "~/components/layout/app-header"
import { AppSidebar } from "~/components/layout/app-sidebar"
import { MobileTabBar } from "~/components/layout/mobile-tab-bar"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import { cn } from "~/lib/utils"

type AppShellProps = {
  email: string
}

type AppLayoutHandle = {
  // "none": 상하좌우 패딩 제거 + 자체 스크롤(messenger). "bleed": 상·좌·우 패딩을 없애
  // 콘텐츠가 화면 가장자리까지 차게 하되 하단 패딩·스크롤은 유지(모바일 full-bleed 피드).
  mobileContentPadding?: "default" | "none" | "bleed"
  showMobileHeader?: boolean
  showMobileTabBar?: boolean
}

export function AppShell({ email }: AppShellProps) {
  const matches = useMatches()
  const handles = matches.map((match) => match.handle as AppLayoutHandle | undefined)
  const mobileContentPadding =
    [...handles].reverse().find((handle) => handle?.mobileContentPadding)?.mobileContentPadding ??
    "default"
  const showMobileTabBar =
    [...handles].reverse().find((handle) => typeof handle?.showMobileTabBar === "boolean")
      ?.showMobileTabBar ?? true
  const showMobileHeader =
    [...handles].reverse().find((handle) => typeof handle?.showMobileHeader === "boolean")
      ?.showMobileHeader ?? true

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-svh w-full flex-1 flex-col overflow-hidden">
        <AppHeader email={email} className={!showMobileHeader ? "max-md:hidden" : undefined} />
        <div className={cn("flex min-h-0 flex-1", showMobileHeader ? "pt-14" : "pt-0 md:pt-14")}>
          <AppSidebar />
          <SidebarInset className="min-h-0">
            <div
              className={
                mobileContentPadding === "none"
                  ? "flex flex-1 flex-col overflow-hidden p-0 md:overflow-y-auto md:p-6 md:pb-6"
                  : mobileContentPadding === "bleed"
                    ? "flex flex-1 flex-col overflow-y-auto p-0 pb-24 sm:p-6 md:pb-6"
                    : "flex flex-1 flex-col overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6"
              }
            >
              <Outlet />
            </div>
          </SidebarInset>
        </div>
        {showMobileTabBar ? <MobileTabBar /> : null}
      </div>
    </SidebarProvider>
  )
}
