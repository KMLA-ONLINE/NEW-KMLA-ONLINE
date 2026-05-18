# Supabase Google OAuth Setup

Reference for setting up Google login with Supabase Auth in this React Vite app.

Last checked against Supabase docs and changelog on 2026-05-18.

## What This Repo Should Contain

This repo should only contain public client code and public Vite environment variables.

- Use `src/lib/supabase.ts` for the browser Supabase client.
- Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only.
- Do not commit Google OAuth client secrets.
- Do not commit Supabase `sb_secret_...`, `service_role`, database passwords, or dashboard-only secrets.

## Google Cloud Setup

Create or open a Google Cloud project, then configure Google Auth Platform.

1. Go to Google Cloud Console.
2. Configure OAuth consent screen branding.
3. Configure audience/user type according to the school community policy.
4. Configure scopes.
5. Create an OAuth Client ID with application type `Web application`.

Required scopes for Supabase Google sign-in:

- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

Keep scopes minimal. Extra sensitive or restricted scopes may trigger Google verification and slow down launch.

## Google OAuth Client Values

In the Google OAuth web client:

### Authorized JavaScript Origins

Add the app origins, without paths:

- `http://localhost:5173`
- `https://your-production-domain`
- Optional Vercel preview origin if needed

If the app is hosted under a path like `https://example.com/app`, the origin is still `https://example.com`.

### Authorized Redirect URIs

Add the Supabase Auth callback URL, not the app callback URL:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Find the exact callback URL in Supabase Dashboard:

```text
Authentication > Providers > Google
```

For local Supabase CLI development only, the callback is usually:

```text
http://127.0.0.1:54321/auth/v1/callback
```

## Supabase Dashboard Setup

In Supabase Dashboard:

1. Go to `Authentication > Providers > Google`.
2. Enable Google provider.
3. Paste the Google OAuth Client ID.
4. Paste the Google OAuth Client Secret.
5. Save the provider settings.

For this web app, do not enable `Skip nonce check` unless there is a specific native-client reason. Supabase documents nonce skipping mainly for clients that cannot handle nonce verification properly.

## Supabase Redirect URLs

In Supabase Dashboard:

```text
Authentication > URL Configuration
```

Set `Site URL` to the production app URL:

```text
https://your-production-domain
```

Add redirect URLs for local, production, and previews:

```text
http://localhost:5173/**
https://your-production-domain/**
https://*-<vercel-team-or-account>.vercel.app/**
```

Use exact production URLs where possible. Keep wildcards mainly for local development and Vercel preview deployments.

The `redirectTo` value passed from app code must match this allow list.

## React Vite Sign-In Code

Basic Google sign-in:

```ts
import { supabase } from "@/lib/supabase"

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) {
    throw error
  }

  return data
}
```

For a browser-only Vite app using the default Supabase client flow, Supabase handles the session after redirect. A dedicated callback route is still useful for showing loading/error UI and forwarding users based on profile approval state.

## Recommended App Flow For This Project

After Google login succeeds:

1. Read the current Supabase user with `supabase.auth.getUser()` when fresh user data is needed.
2. Check the user profile row in `profiles`.
3. If no profile or onboarding is incomplete(`none`), route to `/profile/set`.
4. If `profiles.status = pending`, route to `/pending`.
5. If `profiles.status = rejected`, route to `/rejected`.
6. If `profiles.status = accepted`, route to `/`.

Do not trust `user_metadata` for authorization decisions. Store approval state and roles in database tables or Supabase `app_metadata` if using JWT claims intentionally.

## School Domain Restriction

Google OAuth alone does not prove that a user should be allowed into the official community. For school-only access, enforce the rule server-side.

Recommended options:

- Restrict signups with a Supabase Auth `Before User Created` hook by email domain.
- Use onboarding plus admin approval through `profiles.status`.
- Combine both if the official community must be tightly controlled.

Client-side checks are only UX. They are not access control.

## Vercel Notes

Vercel environment variables for this Vite app remain:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Google OAuth Client Secret is not a Vercel frontend variable. It belongs in the Google provider configuration inside Supabase Dashboard.

For preview deployments, add the Vercel preview wildcard to Supabase Redirect URLs and consider adding the preview origin to Google Authorized JavaScript Origins only if preview Google login is required.

## Common Failure Points

- Google redirect URI uses the app URL instead of `https://<project-ref>.supabase.co/auth/v1/callback`.
- Supabase `redirectTo` is not included in Supabase Redirect URLs.
- Vercel preview URL is not allow-listed.
- Google Authorized JavaScript Origin includes a path instead of only the origin.
- Google OAuth consent screen is not configured, so users see unclear project branding.
- Too many Google scopes trigger additional Google verification.
- Approval or role checks depend on user-editable `user_metadata`.

## References

- Supabase Login with Google: `https://supabase.com/docs/guides/auth/social-login/auth-google`
- Supabase Redirect URLs: `https://supabase.com/docs/guides/auth/redirect-urls`
- Supabase signInWithOAuth JavaScript reference: `https://supabase.com/docs/reference/javascript/auth-signinwithoauth`
- Google Auth Platform: `https://console.cloud.google.com/auth/overview`