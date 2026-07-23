import { Outlet, useMatches } from "react-router"

import { AppHeader } from "~/components/layout/app-header"
import { AppSidebar } from "~/components/layout/app-sidebar"
import { MobileTabBar } from "~/components/layout/mobile-tab-bar"
import { SidebarInset, SidebarProvider } from "~/components/ui/sidebar"
import { cn } from "~/lib/utils"

type AppShellProps = {
  email: string
}

// 모바일 레이아웃은 서로 독립된 축으로 제어한다(예전엔 mobileContentPadding 한 값에
// 여백·스크롤 주체·탭바 간격이 뭉쳐 있어 조합이 안 됐다). md+에선 모든 축이 같은
// 기본 레이아웃(쉘 스크롤 + p-6)으로 수렴한다.
type AppLayoutHandle = {
  // 스크롤 주체. "shell"(기본): 쉘이 스크롤하고 콘텐츠에 여백/탭바 간격을 준다.
  // "self": 라우트가 전체 높이를 차지해 자체 스크롤(앱형 화면, 예: messenger) -- md 전까지
  // 가장자리까지 차고 탭바 간격도 라우트가 직접 관리한다.
  mobileScroll?: "shell" | "self"
  // "shell" 스크롤일 때 모바일 좌우/상단 여백. "inset"(기본) | "bleed"(가장자리까지).
  mobileContentEdge?: "inset" | "bleed"
  showMobileHeader?: boolean
  /** 전역 헤더를 숨긴 라우트가 자체 fixed header를 제공하면 false로 둔다. */
  mobileSafeAreaTop?: boolean
  showMobileTabBar?: boolean
}

export function AppShell({ email }: AppShellProps) {
  const matches = useMatches()
  const handles = matches.map((match) => match.handle as AppLayoutHandle | undefined)
  // 각 축은 독립적으로, 가장 깊은(마지막) 라우트가 정한 값이 이긴다.
  const resolved = [...handles].reverse()
  const mobileScroll = resolved.find((handle) => handle?.mobileScroll)?.mobileScroll ?? "shell"
  const mobileContentEdge =
    resolved.find((handle) => handle?.mobileContentEdge)?.mobileContentEdge ?? "inset"
  const showMobileTabBar =
    resolved.find((handle) => typeof handle?.showMobileTabBar === "boolean")?.showMobileTabBar ??
    true
  const showMobileHeader =
    resolved.find((handle) => typeof handle?.showMobileHeader === "boolean")?.showMobileHeader ??
    true
  const mobileSafeAreaTop =
    resolved.find((handle) => typeof handle?.mobileSafeAreaTop === "boolean")?.mobileSafeAreaTop ??
    !showMobileHeader

  // 탭바 간격은 더 이상 mode에 박지 않고 파생한다: 쉘이 스크롤하고 탭바가 떠 있을 때만
  // 그만큼 하단 여백을 둬 고정 탭바에 콘텐츠가 가리지 않게 한다(self 스크롤은 라우트가 관리).
  const needsTabBarClearance = showMobileTabBar && mobileScroll === "shell"

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex h-svh w-full flex-1 flex-col overflow-hidden">
        <AppHeader email={email} className={!showMobileHeader ? "max-md:hidden" : undefined} />
        <div
          className={cn(
            "flex min-h-0 flex-1",
            showMobileHeader
              ? "pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-14"
              : mobileSafeAreaTop
                ? "pt-[env(safe-area-inset-top)] md:pt-14"
                : "pt-0 md:pt-14"
          )}
        >
          <AppSidebar />
          <SidebarInset className="min-h-0">
            <div
              className={cn(
                "flex flex-1 flex-col",
                // 스크롤 주체 -- self는 모바일에서 자체 스크롤, md+에선 쉘 스크롤로 수렴.
                mobileScroll === "self"
                  ? "overflow-hidden p-0 md:overflow-y-auto md:p-6"
                  : cn(
                      "overflow-y-auto sm:p-6",
                      // shell 스크롤일 때만 모바일 좌우/상단 여백 축이 의미를 가진다.
                      mobileContentEdge === "bleed" ? "p-0" : "p-4",
                      needsTabBarClearance &&
                        "pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6"
                    )
              )}
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
