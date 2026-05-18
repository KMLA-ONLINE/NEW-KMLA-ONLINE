# NEW KMLA ONLINE

React Router v7 Framework Mode 기반의 KMLA 온라인 커뮤니티 SPA입니다.

## Stack

- React 19
- React Router 7 Framework Mode with SPA mode
- TypeScript 6
- Vite 8
- Tailwind CSS 4
- Supabase JS
- TanStack Query 5
- React Hook Form
- Zod
- Zustand
- ESLint, Prettier, Husky, lint-staged

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run lint
```

- `npm run dev`: starts the React Router framework dev server.
- `npm run typecheck`: runs `react-router typegen && tsc -b`.
- `npm run build`: emits the SPA build under `build/client`.
- `npm run lint`: runs ESLint. Existing warnings are allowed by config.

There is currently no test script or test config.

## App Structure

```txt
app/
  root.tsx        # framework root document and outlet
  routes.ts       # single source of truth for URL paths
  guards/         # route layout guards, currently pass-through
  routes/         # route modules

src/
  components/     # shared design-system components
  lib/            # shared libraries, including Supabase client
  styles/         # global Tailwind v4 theme and CSS
```

Do not add a new `index.html`, `src/main.tsx`, or `src/routes/router.tsx`. Framework mode owns the app entrypoint through `app/root.tsx` and `app/routes.ts`.

## Docs

- `docs/ROUTES.md`: route map and routing conventions.
- `docs/SUPABASE_SETUP.md`: Supabase environment and dashboard setup notes.
- `docs/SUPABASE_GOOGLE_OAUTH.md`: Google OAuth setup through Supabase Auth.
- `docs/SCHEMA.md`: DBML-style schema reference.
