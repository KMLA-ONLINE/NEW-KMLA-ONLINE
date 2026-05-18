# Supabase Setup

This project uses React, Vite, Supabase, and Vercel. Database changes are not applied from this repo; create or update the Supabase project in the dashboard, then record schema changes separately.

## Local Environment

1. Copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` to the project URL from the Supabase Connect dialog.
3. Set `VITE_SUPABASE_PUBLISHABLE_KEY` to a `sb_publishable_...` key from Supabase `Settings > API Keys`.

Do not put `sb_secret_...`, `service_role`, or database passwords in Vite environment variables. Vite variables are bundled into browser code when prefixed with `VITE_`.

## Vercel Environment

Add the same public client variables in Vercel Project Settings for Production, Preview, and Development:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

If using the Vercel Supabase integration, do not rely on `NEXT_PUBLIC_*` variables for this Vite app. Vite only exposes variables prefixed with `VITE_`.

## Auth Redirect URLs

In Supabase `Authentication > URL Configuration`:

- Set `Site URL` to the production domain.
- Add `http://localhost:5173/**` for local development.
- Add the production domain callback path exactly.
- Add `https://*-<vercel-team-or-account>.vercel.app/**` if Vercel preview deployments need auth callbacks.

Use exact production URLs where possible. Keep wildcard redirects for local development and previews only.

## School Community Signup Control

For an official school community, restrict signup server-side instead of only hiding UI controls.

Recommended options:

- Use a Supabase Auth `Before User Created` hook to allow only school email domains.
- If school email is not enough, require onboarding fields and admin approval through `profiles.status`.
- Store authorization state in database tables or `app_metadata`, not user-editable `user_metadata`.

## Data API And RLS

For every app table exposed to the Data API:

- Grant only the required privileges to `anon` and `authenticated`.
- Enable Row Level Security.
- Add policies that match the route and membership rules in `docs/ROUTES.md`.
- Add indexes for columns used in RLS policies and common filters.

New Supabase projects may not expose new tables to the Data API automatically. Treat `GRANT` and RLS policies as one unit when creating tables.

## Verification

Run:

```bash
npm run build
```

The app will throw at runtime if `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` is missing, so configure `.env.local` before starting Vite.
