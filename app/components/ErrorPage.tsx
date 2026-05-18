import { Link } from "react-router"

type ErrorPageProps = {
  code: "403" | "404" | "500"
  title: string
  description: string
}

export function ErrorPage({ code, title, description }: ErrorPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-surface-base)] px-6 py-10 text-[var(--color-text-primary)]">
      <section className="w-full max-w-lg rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] p-6 text-center shadow-sm">
        <p className="font-mono text-sm text-[var(--color-text-tertiary)]">{code}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-3 text-[var(--color-text-secondary)]">{description}</p>
        <Link
          className="mt-6 inline-flex text-sm font-medium text-[var(--color-text-link)] hover:text-[var(--color-text-link-hover)]"
          to="/"
        >
          Back to home
        </Link>
      </section>
    </main>
  )
}
