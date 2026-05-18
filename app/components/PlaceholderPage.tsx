import { Link, useLocation } from "react-router"

type PlaceholderPageProps = {
  title: string
  description: string
  access: string
}

export function PlaceholderPage({ title, description, access }: PlaceholderPageProps) {
  const location = useLocation()

  return (
    <main className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 text-[var(--color-text-primary)]">
      <section className="mx-auto flex max-w-3xl flex-col gap-6 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] p-6 shadow-sm">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm text-[var(--color-text-tertiary)]">{location.pathname}</p>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-base text-[var(--color-text-secondary)]">{description}</p>
        </div>

        <dl className="grid gap-2 rounded-xl bg-[var(--color-surface-subtle)] p-4 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
            <dt className="font-semibold text-[var(--color-text-primary)]">Access</dt>
            <dd className="text-[var(--color-text-secondary)]">{access}</dd>
          </div>
        </dl>

        <Link
          className="text-sm font-medium text-[var(--color-text-link)] hover:text-[var(--color-text-link-hover)]"
          to="/"
        >
          Back to home
        </Link>
      </section>
    </main>
  )
}
