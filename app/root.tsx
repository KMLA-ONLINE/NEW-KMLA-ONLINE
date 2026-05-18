import type { ReactNode } from "react"
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"
import "@/styles/global.css"

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export function HydrateFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)] px-6 text-[var(--color-text-primary)]">
      <p className="text-sm text-[var(--color-text-secondary)]">Loading KMLA Online...</p>
    </main>
  )
}

export default function App() {
  return <Outlet />
}
