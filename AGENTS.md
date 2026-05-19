# AGENTS.md

## Stack
- Single-package React Router 7 app with SSR enabled in `react-router.config.ts`.
- Routes are file-based via `flatRoutes()` in `app/routes.ts`; add route modules under `app/routes/`.
- `npm` is the package manager here. Use the committed `package-lock.json`; do not assume `pnpm` or a monorepo tool.
- Tailwind CSS v4 is loaded from `app/app.css`.
- shadcn is configured in `components.json` with style `radix-nova`.
- Supabase browser helpers live in `app/lib/supabase/client.ts`; server helpers live in `app/lib/supabase/server.ts`.

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
- There are currently no test files or CI workflows in this repo.

## Scope / Generated Files
- `.react-router/` is generated and gitignored.
- The `lint`, `lint:fix`, and `format` scripts only target `app/`; root config files are outside those scripts.
- Pre-commit runs `npx lint-staged` on staged `app/**/*.{ts,tsx}` only.

## Imports / Aliases
- The only verified TS path alias is `~/* -> app/*` in `tsconfig.json`.
- Do not assume `@/*` works. `components.json` advertises `@/...` aliases, but `tsconfig.json` does not define them.
- Several route files currently import from `@/registry/default/...`, but there is no matching alias or local `registry/default` directory. Treat those imports as suspect and verify before reusing them.
- Local UI components live in `app/components/ui/`.

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
- This repo has `opencode.json` wired to the shadcn MCP server. Prefer MCP registry search/view tools for discovery; use `npx shadcn@latest ...` only when you need CLI project info or to actually install/update code.
- Before installing or updating shadcn components, inspect project info first and verify the resolved aliases. Do not copy registry code that assumes `@/components/ui/...` without fixing imports for this repo.
- Use `frontend-design` only for explicit page/component redesign work. Preserve the repo's existing Tailwind v4 + shadcn token setup unless the user asks for a broader visual change.
- Use `vercel-react-best-practices` selectively for React performance work. Ignore Next.js-specific guidance that does not apply to this React Router app.
- Use `web-design-guidelines` only for UI/a11y/design review requests; it is an audit skill, not an implementation guide.
