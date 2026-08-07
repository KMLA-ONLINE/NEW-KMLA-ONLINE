import { ThemeProvider } from "next-themes"
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"

import type { Route } from "./+types/root"
import "./app.css"
import { ErrorPage } from "~/components/error/error-page"
import { TooltipProvider } from "~/components/ui/tooltip"
import { Toaster } from "~/components/ui/sonner"

export const links: Route.LinksFunction = () => []

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // next-themes가 하이드레이션 전에 <html>의 class를 바꾸므로 서버 마크업과 어긋나는 게 정상이다.
    <html lang="ko-KR" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* app.css의 dark 변형이 `.dark` 클래스 기준이라(@custom-variant dark (&:is(.dark *)))
            attribute는 class여야 한다. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let status: number | undefined
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    status = error.status
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    stack = error.stack
  }

  return <ErrorPage status={status} onRetry={() => window.location.reload()} stack={stack} />
}
