- Always ask the user upfront if you prefer a TDD approach before writing any code.
- Ask clarifying questions as plain text
- Always read files as UTF-8.
- Do not use excessive skills for simple tasks.
- Before modifying the DB, clearly state your intended action and expected result to the user, and ask for confirmation.
- Must support responsive layouts across desktop, tablet, and mobile.
- Compose from existing organisms, molecules, and atoms; avoid introducing new components.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.

- If multiple interpretations exist, present them - don't pick silently.

- If a simpler approach exists, say so. Push back when warranted.

- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.

- No abstractions for single-use code.

- No "flexibility" or "configurability" that wasn't requested.

- No error handling for impossible scenarios.

- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.

- Don't refactor things that aren't broken.

- Match existing style, even if you'd do it differently.

- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.

- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"

- "Fix the bug" → "Write a test that reproduces it, then make it pass"

- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```

1. [Step] → verify: [check]

2. [Step] → verify: [check]

3. [Step] → verify: [check]

```

# AGENTS.md

## Commands

- Use npm; this repo has `package-lock.json` lockfileVersion 3 and no pnpm/yarn lockfile.
- Install with `npm ci` for a clean checkout, or `npm install` when intentionally updating the lockfile.
- `npm run dev` starts React Router framework dev server.
- `npm run build` runs `react-router build` and emits the SPA build under `build/client`.
- `npm run typecheck` runs `react-router typegen && tsc -b` and is the focused typecheck command.
- `npm run lint` runs ESLint for the whole repo; warnings are allowed by config and currently do not fail the command.
- `npm run lint:fix` runs `eslint . --fix`; `npm run format` runs Prettier on `app/` and `src/`.
- There is currently no test script or test config; do not invent `npm test` as a verification step.

## App Wiring

- Runtime entrypoint is React Router framework mode: `app/root.tsx` plus the route list in `app/routes.ts`.
- `app/routes.ts` is the single source of truth for URL paths and route module files.
- Vite and TypeScript both map `@` / `@/*` to `src`; shared design-system code remains under `src/components`, and route modules live under `app/routes`.
- `noUnusedLocals`, `noUnusedParameters`, and `erasableSyntaxOnly` are enabled, so unused values and non-erasable TypeScript syntax fail `npm run typecheck` even if ESLint only warns.

## Components And Styling

- Components are organized under `src/components/{atoms,molecules,organisms,cross-cutting}`; each component folder generally re-exports from an `index.ts`.
- Follow the existing Radix + `class-variance-authority` component style for variants and `asChild`/`Slot` patterns where already used.
- Tailwind v4 is loaded through `@tailwindcss/vite`; there is no `tailwind.config.*` file.
- Design tokens live in `src/styles/global.css` as Tailwind v4 `@theme` variables; prefer semantic `var(--color-...)` tokens over ad hoc colors, and do not import a missing `src/index.css`.
- `src/styles/global.css` imports `tw-animate-css`; keep it loaded for classes such as `animate-in`, `fade-in-0`, and `zoom-in-95`.
- Prettier uses double quotes, no semicolons, width 100, LF endings, and `prettier-plugin-tailwindcss` for class ordering.
- `src/components/molecules/MessageBubble/README.md` defines `MessageBubble` as a message-page product component, not a generic chat primitive; callers own realtime state, Supabase subscriptions, read receipts, and grouping calculations.

## Supabase / Data Model

- `@supabase/supabase-js` is installed, and the browser client lives in `src/lib/supabase.ts`; it is not wired into route guards yet.
- `docs/SCHEMA.md` is a DBML-style Supabase-oriented schema reference, not an applied migration; it explicitly calls out required future RLS policies, checks, indexes, triggers/RPCs, and `pgcrypto`/`gen_random_uuid()` setup.
- Do not create `auth.users` manually in migration SQL; `docs/SCHEMA.md` marks it as Supabase Auth-managed visual reference only.
- Migration SQL files live in `docs/migrations/` as a manual record only; they are not executed by CLI and exist purely as a changelog. File naming: `YYYYMMDD_description.sql`.
- Do not apply migrations programmatically; all schema changes are applied via the Supabase dashboard and then recorded in `supabase/migrations/` by hand.

## Hooks

- Husky `pre-commit` runs `npx lint-staged`; lint-staged targets `{app,src}/**/*.{ts,tsx}` with ESLint fix and Prettier write.
- ESLint uses flat config in `eslint.config.js`; `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-empty-object-type`, and `react-refresh/only-export-components` are warnings, not errors.
