# KMLA Online

KMLA Online is the renewal version of the school community app for Korean Minjok Leadership Academy (KMLA).

## Status

This project is in early development and currently serves as the starting point for the new app.

## Planned Features

- Google OAuth sign-in
- Group-based announcements and communication
- Push notifications
- Messaging
- Posts

## Tech Stack

- React Router 7
- React 19
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Supabase

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

The app runs locally at `http://localhost:5173`.

## Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Useful Commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
```

## Deployment

Deployment is currently planned for Vercel.
