# AGENTS.md

## Stack

- Single-package React Router 7 app with SSR enabled in `react-router.config.ts`.
- Routes are file-based via `flatRoutes()` in `app/routes.ts`; add route modules under `app/routes/`.
- `npm` is the package manager here. Use the committed `package-lock.json`; do not assume `pnpm` or a monorepo tool.
- Tailwind CSS v4 is loaded from `app/app.css`.
- shadcn is configured in `components.json` with style `radix-vega`.
- Supabase browser helpers live in `app/lib/supabase/client.ts`; server helpers live in `app/lib/supabase/server.ts`.

## Local Supabase Ports

- Default Supabase ports (54321-54327) often conflict with **Windows Hyper-V reserved port ranges**.
- This repo uses **54720–54727** instead. Set these in `supabase/config.toml` if you get port binding errors:
  - API: 54721, DB: 54722, Shadow DB: 54720, Studio: 54723, Inbucket: 54724, Analytics: 54727
- The Supabase MCP URL in `opencode.json` uses the Studio MCP endpoint: `http://127.0.0.1:54723/api/mcp`

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Prod server: `npm run start`
- Lint app code: `npm run lint`
- Fix app lint issues: `npm run lint:fix`
- Format app code: `npm run format`
- Typecheck: `npm run typecheck`

## Validation

- For normal code changes, run `npm run lint` then `npm run typecheck`.
- `npm run typecheck` runs `react-router typegen && tsc`; it regenerates `.react-router/types`.
- `npm test` runs vitest (test files live next to routes, e.g. `app/routes/_app.profile.test.tsx`).
- DB checks live in `supabase/tests/`: run `schema_runtime_check.sql` with psql against the local DB after `supabase db reset` (`begin ... rollback`, safe to re-run). `schema_rls_check.sql` is stale — it asserts contracts that were never implemented (identity stamping, a `message_reads` table) and currently fails; do not use it as a gate. `storage_maintenance_check.ps1` is documented in `supabase/functions/README.md`.
- The only CI workflow is `.github/workflows/sync-main-to-dev.yml` (branch sync); tests are not run in CI.

## Scope / Generated Files

- `.react-router/` is generated and gitignored.
- The `lint`, `lint:fix`, and `format` scripts only target `app/`; root config files are outside those scripts.

## Documentation

- When changing code, schema, migrations, or behavior, update any related Markdown docs in the repo during the same task when such docs already exist.
- In Markdown prose, use spaced range notation like `1 ~ 100`, not `1~100`.

## Imports / Aliases

- The only verified TS path alias is `~/* -> app/*` in `tsconfig.json`.
- Do not assume `@/*` works.
- `app/components/ui/` is reserved for atom-level UI primitives.
- Service/domain components must live in `app/components/`, not `app/components/ui/`.

## Database Schema Workflow

- The DB source of truth is `supabase/schemas/`: declarative schema files split by domain, each file ordered type → table → index → function → trigger → RLS/policy → RPC. Do not create global per-object-type files (`rls.sql`, `rpc.sql`); keep a domain's objects together. Shared `private.*` helpers used across domains belong in a foundation/shared file.
- `supabase/migrations/` is a delta artifact for applying changes to production DB safely. It is not where you read or edit the current structure.
- To change the DB: edit `supabase/schemas/` first, then generate the migration with `supabase db diff -f <name>`. Never modify or delete a migration that has been applied to production.
- Data-preserving changes (rename, backfill, type conversion, NOT NULL transition, any DML) must be written explicitly in the migration. The diff tool does not capture DML (e.g. `storage.buckets` seed rows, which live at the end of the baseline migration) and is unreliable for grant/revoke changes — review generated migrations by hand; `schema_runtime_check.sql` catches grant regressions.
- After a schema change, verify with `supabase db reset`, `schema_runtime_check.sql`, and `supabase db diff` returning "No schema changes found".
- Human-readable docs for the schema live in `docs/db/` (`README.md` for rules, `domains/*.md` mapped 1:1 to schema files, listing every RPC and trigger). Update them in the same task as schema changes.
- The remote DB still carries pre-transition migration history; on first deploy align it with `supabase db reset --linked` (pre-launch, no data to keep) or `supabase migration repair`, then use normal `supabase db push`.

## Database Architecture

- RPC surface was intentionally trimmed (2026-07): only chat/messaging, automatic storage cleanup, and basic profile lifecycle RPCs exist. See `docs/db/domains/*.md` for the per-domain RPC and trigger inventory.
- **Chat/messaging and profile lifecycle writes:** use **RPC functions** (`supabase.rpc(...)`). They run as `SECURITY DEFINER` and handle atomic multi-table changes with auth checks (`private.require_current_profile()`, `private.require_app_admin()`).
- **Posts, comments, reactions, gongangs, song requests, club applications:** direct table access via `supabase.from(...)` with RLS and column-level grants as the authorization boundary. These domains have no RPCs.
- **Spaces:** currently no write path for authenticated users — space RPCs were removed and `spaces`/`space_members` have no direct insert grants (only `notification_setting` update). Re-add RPCs or grants before building space features.
- **Reads:** direct table access with RLS. Message search uses the `search_messages` RPC; there is no post search RPC.
- Denormalized counters such as `posts.comment_count`, `posts.reaction_count`, and `spaces.member_count` are cached values with no reconciliation job (`reconcile_cached_counts` was removed). Do not treat them as authoritative when exact counts are required.

## Wiring the Backend

Much of the app still renders module-level mock arrays (feed, spaces, profile, messenger). When replacing one with real data:

- Read and write from a route `loader` / `action` using `createClient(request)` from `app/lib/supabase/server.ts`. Do not call Supabase from a component body or a `useEffect`.
- Any route module that touches `supabase.auth` must return the `headers` from `createClient(request)` on **every** response (`redirect(to, { headers })`, `data(value, { headers })`). Dropping them silently discards the refreshed session cookie, and the next request arrives logged out.
- `app/lib/supabase/client.ts` is for browser-only concerns — realtime subscriptions and direct-to-storage uploads. Everything else belongs on the server.
- Keep components data-agnostic: they take rows as props and the route supplies them. A component that imports a constant standing in for a table (see `PLACEHOLDER_REACTION_TYPES` in `app/lib/reactions.ts`) has to be rewritten when the loader lands; one that takes props does not.
- Shape mock data like the query that will replace it — ISO timestamps rather than `"2h ago"`, real column names, nullable fields actually nullable. Formatting is the renderer's job.
- Every RLS policy gates on `private.is_accepted_user()`. A signed-in user whose `profiles.status` is not `accepted` sees empty results rather than an error, so route on `status` (`none`/`rejected` → `/setup`, `pending` → `/pending`) instead of on the session alone.

## DB Types

- Shared enums live in `app/lib/supabase/database.types.ts`.
- For full generated types, run `supabase gen types --local > app/lib/supabase/database.types.ts` (requires Docker running).

## Env

- Required env vars are listed in `.env.example`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- Client code reads `import.meta.env.*`.
- Server code currently reads `process.env.*` for the same `VITE_*` values.

## Skills

- Repo-local skills are vendored upstream in `.agents/skills/`; they are general-purpose aids, not app-specific architecture docs.
- Use `react-router-framework-mode` for route modules, `loader`/`action`, redirects, auth flow, `root.tsx`, route-generated `./+types/*`, or `react-router.config.ts` changes.
- Use `shadcn` whenever touching `components.json`, adding/updating shadcn components, or composing UI from the existing `app/components/ui/*` primitives.
- Use `supabase` for auth, schema, migrations, RLS, storage, local Supabase config, or MCP-backed Supabase work.
- Before installing or updating shadcn components, inspect project info first and verify the resolved aliases. Do not copy registry code that assumes `@/components/ui/...` without fixing imports for this repo.
- Use `frontend-design` only for explicit page/component redesign work. Preserve the repo's existing Tailwind v4 + shadcn token setup unless the user asks for a broader visual change.
- Use `vercel-react-best-practices` selectively for React performance work. Ignore Next.js-specific guidance that does not apply to this React Router app.
- Use `web-design-guidelines` only for UI/a11y/design review requests; it is an audit skill, not an implementation guide.

## MCP

- `opencode.json` enables the `shadcn` MCP server. Prefer MCP registry search/view/example tools for shadcn discovery and installation work.
- `opencode.json` enables the `supabase` MCP server at `http://127.0.0.1:54723/api/mcp`. Prefer MCP tools for Supabase docs, SQL, advisors, and project inspection when available.
- For shadcn project metadata such as aliases, framework, base, and installed components, use `npx shadcn@latest info` because MCP only covers registry operations.
