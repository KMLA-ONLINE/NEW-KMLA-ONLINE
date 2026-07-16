# AGENTS.md

## Stack

- Single-package React Router 7 app in **SPA mode** (`ssr: false` in `react-router.config.ts`). There is no server render: the build pre-renders only the root shell, and every route renders in the browser. Server `loader`/`action` never run — use `clientLoader`/`clientAction`.
- Routes are declared explicitly in `app/routes.ts` with `index()` / `route()` / `layout()`. A file's path is not its URL, and a new module under `app/routes/` does nothing until it is registered there. Moving to `flatRoutes()` is the eventual plan; write route modules so that switch stays cheap, but do not assume it has happened.
- `npm` is the package manager here. Use the committed `package-lock.json`; do not assume `pnpm` or a monorepo tool.
- Tailwind CSS v4 is loaded from `app/app.css`.
- shadcn is configured in `components.json` with style `radix-vega`.
- Supabase helpers live in `app/lib/supabase/client.ts` (browser `createBrowserClient`). There is no server client — SPA has no request to build one from.
- **Auth runs in the browser.** Direct messages are end-to-end encrypted, and the key that opens them is derived from the password — so the raw password must never reach any server. SPA has no server `action` to be tempted into, and `login`/`signup`/`reset-password` call the browser Supabase client and send only a derived `authHash`. Do not add a server that handles the password. See [docs/e2ee.md](docs/e2ee.md).

## Local Supabase Ports

- Supabase's default ports collide with **Windows Hyper-V reserved port ranges**, so `supabase/config.toml` already pins its own. Nothing to configure.
  - API: 54721, DB: 54722, Shadow DB: 54720, Studio: 54723, Inbucket: 54724, Analytics: 54727. The connection pooler is disabled and would sit on 54329.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build` (SPA — emits static `build/client/`; there is no `build/server`)
- Preview the prod build locally: `npm run start` (`vite preview` over `build/client`, with SPA history fallback). Deploys are static hosting (Vercel), not a Node server.
- Lint app code: `npm run lint`
- Fix app lint issues: `npm run lint:fix`
- Format app code: `npm run format`
- Typecheck: `npm run typecheck`

## Validation

- For normal code changes, run `npm run lint` then `npm run typecheck`.
- `npm run typecheck` runs `react-router typegen && tsc`; it regenerates `.react-router/types`.
- `npm test` runs the fast unit suite. `npm run test:e2ee` runs the real local-Supabase E2EE round-trip and fails when the local API is unavailable; use it for crypto work.
- DB checks live in `supabase/tests/`: run `npm run test:db` against the local DB after `supabase db reset`. One file per domain, each with its own `begin ... rollback` (safe to re-run, and runnable alone: `node supabase/tests/run.mjs 05-chat`). `00-privileges.sql` is not a domain — it holds the schema-wide privilege invariants that catch what `db diff` cannot see. `storage_maintenance_check.ps1` is documented in `supabase/functions/README.md`.
- **The pre-commit hook enforces the expensive checks, but only for the paths that need them** (`.husky/pre-commit`). There is no test CI — the sole workflow is `.github/workflows/sync-main-to-dev.yml` (branch sync) — so the hook *is* the safety net.
  - Staging anything under `supabase/` ⇒ `supabase db diff` must return "No schema changes found" (otherwise `test:db` would be checking a stale DB and its green would be a lie), then `npm run test:db` must pass. If local Supabase is not running, the commit is **blocked** rather than silently skipped.
  - Staging anything under `app/lib/crypto/` ⇒ KDF/AAD unit tests and the required local E2EE round-trip both run; unlike `npm test`, the latter is never silently skipped.
  - Everything else stays as fast as before: lint + typecheck only. A slow hook trains people to reach for `--no-verify`, which is worse than no hook — they would still believe the check ran.
- The DB hook is a security boundary, not busywork: `db diff` does not emit function grants, and `00-privileges.sql` previously caught `SECURITY DEFINER` helpers left executable by `PUBLIC` despite lint, typecheck, and diff all passing.

## Scope / Generated Files

- `.react-router/` is generated and gitignored.
- The `lint`, `lint:fix`, and `format` scripts only target `app/`; root config files are outside those scripts.

## Documentation

- When changing code, schema, migrations, or behavior, update any related Markdown docs in the repo during the same task when such docs already exist.
- In Markdown prose, write ranges as `1 ~ 100`, never `1~100`. Two unspaced tildes pair up into strikethrough syntax and the preview swallows everything between them. A hyphen (`1-100`) is safe either way.
- In `docs/db/domains/`, arrange RPC and trigger tables by caller flow under headings, never by SQL declaration or alphabetic order. The canonical grouping rule is in `docs/db/README.md`.

## Windows patching(codex)

- If `apply_patch` fails with `windows sandbox ... apply deny-read ACLs`, do not retry it or the `apply_patch.bat` wrapper. Use the Codex patch engine directly with one UTF-8 PATCH argument only when the runner exposes it; otherwise report the tool limitation instead of attempting an unverified workaround.

## Imports / Aliases

- The only verified TS path alias is `~/* -> app/*` in `tsconfig.json`.
- Do not assume `@/*` works.
- `app/components/ui/` is reserved for atom-level UI primitives.
- Service/domain components must live in `app/components/`, not `app/components/ui/`.

## Loading & Pending UI

React Router blocks a navigation until the destination's loaders resolve: the previous page stays on screen and nothing of the new route renders. Pending UI therefore has to live outside the route outlet, and a skeleton cannot appear at all unless that route deliberately streams.

The policy below is settled. Build each piece when the wait it covers becomes real — an indicator you cannot make appear is an indicator you cannot test.

- **Loaders `await` their data.** Do not return promises for `<Suspense>` / `<Await>` unless a specific route needs a streamed skeleton. That choice reshapes the loader into critical vs deferred data, so make it per route, and only once the wait is measured.
- **Navigation:** nav items are `NavLink`s carrying `prefetch="intent"`, which warms the route's code-split chunk even before it has a loader. When loaders exist, give the clicked item its own pending state via the `isPending` render prop — feedback belongs on the element the user touched, not at the far edge of the screen.
- **A thin global top bar** covers navigations with no source element: browser back/forward, `redirect()` from an action, programmatic `navigate()`. Not built yet. It needs a delay before showing and a minimum hold after, or it strobes on every click; start around 120ms and 300ms and tune against real loader timings. Indeterminate, with no faked progress — a `div` and a CSS transition beat a progress library.
- **Mutations** show pending on the submitting control, not globally (see the `Loader2` button state in `app/routes/login.tsx`). A `fetcher` is local, so its feedback is local.
- **Skeletons** are for lists that append rows (paginated feed, older chat messages), where one row component covers it. Avoid the kind that mirrors a whole page layout: it drifts from the component it imitates. Never replace an already-painted page with a full-page spinner.

## Database Schema Workflow

- The DB source of truth is `supabase/schemas/`: declarative schema files split by domain, each file ordered type → table → index → function → trigger → RLS/policy → RPC. Do not create global per-object-type files (`rls.sql`, `rpc.sql`); keep a domain's objects together. Shared `private.*` helpers used across domains belong in a foundation/shared file.
- `supabase/migrations/` is a delta artifact for applying changes to production DB safely. It is not where you read or edit the current structure.
- To change the DB: edit `supabase/schemas/` first, then generate the migration with `supabase db diff -f <name>`. Never modify or delete a migration that has been applied to production.
- Data-preserving changes (rename, backfill, type conversion, NOT NULL transition, any DML) must be written explicitly in the migration. The diff tool does not capture DML (e.g. `storage.buckets` seed rows, which live at the end of the baseline migration) and is unreliable for grant/revoke changes — review generated migrations by hand; `supabase/tests/00-privileges.sql` catches grant regressions.
- After a schema change, verify with `supabase db reset`, `npm run test:db`, and `supabase db diff` returning "No schema changes found".
- Human-readable docs for the schema live in `docs/db/` (`README.md` for rules, `domains/*.md` mapped 1:1 to schema files, listing every RPC and trigger). Update them in the same task as schema changes.
- The remote DB still carries pre-transition migration history; on first deploy align it with `supabase db reset --linked` (pre-launch, no data to keep) or `supabase migration repair`, then use normal `supabase db push`.

## Database Architecture

- Comment and reaction counts are not cached. Read them with `count(*)`; `posts` has no counter columns. A cache would need a trigger, since clients write `comments` and `post_reactions` directly under column grants rather than through an RPC.
- `spaces.member_count` **is** cached, maintained when a space is created and by the `join_space` / `leave_space` / `accept_space_invite` / `approve_join_request` RPCs. There is no reconciliation job (`reconcile_cached_counts` was removed), so treat it as approximate where an exact count matters.

## Wiring the Backend

Much of the app still renders module-level mock arrays (feed, spaces, profile, messenger). When replacing one with real data:

- Read and write from a route `clientLoader` / `clientAction` using `createClient()` from `app/lib/supabase/client.ts`. Do not call Supabase from a component body or a `useEffect` — the route module is still the seam. (Server `loader`/`action` do not run in SPA mode; do not add them.)
- The browser client persists and refreshes the session on its own (cookies + localStorage). There is no `headers` handoff to thread through responses the way a server loader needed — that whole cookie dance is gone with SSR.
- Keep components data-agnostic: they take rows as props and the route supplies them. A component that imports a constant standing in for a table (see `PLACEHOLDER_REACTION_TYPES` in `app/lib/reactions.ts`) has to be rewritten when the loader lands; one that takes props does not.
- Shape mock data like the query that will replace it — ISO timestamps rather than `"2h ago"`, real column names, nullable fields actually nullable. Formatting is the renderer's job.
- Every RLS policy gates on `private.is_accepted_user()`. A signed-in user whose `profiles.status` is not `accepted` sees empty results rather than an error, so route on `status` (`none`/`rejected` → `/setup`, `pending` → `/pending`) instead of on the session alone.

## DB Types

- `app/lib/supabase/database.types.ts` is committed and holds the full generated surface: every table, view, function and enum. Derive row and RPC argument types from it instead of re-declaring shapes by hand.
- Regenerate it in the same task as a schema change: `supabase gen types --local > app/lib/supabase/database.types.ts` (requires Docker running).
- RPC parameters with no SQL default are generated as non-null even when the column behind them is nullable. Map over the `Args` type when you need to pass a null.

## Env

- Required env vars are listed in `.env.example`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- All code reads `import.meta.env.*` (client-only bundle — there is no server code reading `process.env.*`).

## OpenCode integrations

- This section applies only to OpenCode. Other runners use their injected skills and tools; do not infer unavailable integrations from this file.
- Use `react-router-framework-mode` for React Router routes, `shadcn` for `components.json` or `app/components/ui/`, and `supabase` for auth, schema, migrations, RLS, Storage, or local Supabase work.
- Before changing shadcn components, inspect project metadata and aliases; this repo uses `~/*`, not `@/*`. Use `frontend-design` only for explicit redesigns, `vercel-react-best-practices` only for React performance work, and `web-design-guidelines` only for UI/a11y audits.
- OpenCode MCP servers are configured in `opencode.json`: prefer the shadcn registry tools for registry work and the local Supabase MCP endpoint for Supabase inspection. For shadcn project metadata, use `npx shadcn@latest info`.
