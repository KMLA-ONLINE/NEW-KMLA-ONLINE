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

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

# Repository Instructions

## Project Shape
- This is a single Vite app, not a monorepo. Root `package.json` and `package-lock.json` are the source of truth for scripts and package manager; use npm.
- App entry is `index.html` -> `src/main.tsx`. There is currently no `src/App.tsx`; add one and render it from `src/main.tsx` when building app UI.
- The `@` alias points to `src` in both `vite.config.ts` and `tsconfig.app.json`.
- Shared UI lives under `src/components` using `atoms`, `molecules`, `organisms`, and `cross-cutting` folders. Components mostly import sibling layers with relative paths.

## Commands
- `npm run dev` starts the Vite dev server.
- `npm run build` runs `tsc -b` and then `vite build`; use it for full verification.
- `npx tsc -b` is the focused typecheck command when you do not need a Vite production build.
- `npm run lint` runs ESLint over the repo. `npm run lint:fix` applies ESLint fixes.
- `npm run format` runs Prettier only on `src/`.
- There is no test script configured yet; do not invent test commands without adding the tooling first.

## Styling
- Tailwind v4 is loaded through `@tailwindcss/vite`; there is no `tailwind.config.*` file.
- Global styles and design tokens are in `src/styles/global.css`, imported directly by `src/main.tsx`. Do not import a missing `src/index.css`.
- `src/styles/global.css` also imports `tw-animate-css`; keep it loaded for component classes such as `animate-in`, `fade-in-0`, and `zoom-in-95`.
- Prettier uses `prettier-plugin-tailwindcss`, double quotes, no semicolons, 2-space indentation, trailing commas, and LF endings.

## Lint And Commit Hooks
- ESLint uses flat config in `eslint.config.js`; Prettier is enforced through `eslint-plugin-prettier/recommended`.
- `@typescript-eslint/no-unused-vars`, `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-empty-object-type`, and `react-refresh/only-export-components` are warnings, not errors.
- Husky pre-commit runs `npx lint-staged`; staged `src/**/*.{ts,tsx}` files get `eslint --fix` and `prettier --write`.

## TypeScript Gotchas
- `tsconfig.app.json` includes only `src`; `tsconfig.node.json` includes only `vite.config.ts`.
- `noUnusedLocals`, `noUnusedParameters`, and `erasableSyntaxOnly` are enabled, so type-only imports/exports and unused parameters matter during `npm run build`.
