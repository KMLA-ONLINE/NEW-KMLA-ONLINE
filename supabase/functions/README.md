# Edge Functions

## Local

1. Start Docker Desktop and local Supabase with `npx supabase start`.
2. Apply migrations with `npx supabase db reset --local --yes`.
3. Start functions with `npx supabase functions serve`.
4. Run `powershell -ExecutionPolicy Bypass -File supabase/tests/edge_storage_check.ps1`.

`authorize-upload` and `authorize-download` require an authenticated user JWT. `storage-maintenance` accepts only a Supabase secret key and must never be called from a client.

Edge Function dependencies are pinned in each function's `deno.json`. Post and message attachments allow the MIME list defined in `20260612121249_storage_buckets.sql`; non-image files are returned as downloads. File content malware scanning is not performed.

## Production

Deploy after the database migrations:

```bash
npx supabase functions deploy authorize-upload
npx supabase functions deploy authorize-download
npx supabase functions deploy storage-maintenance --no-verify-jwt
```

Schedule an HTTPS `POST` to `storage-maintenance` at least daily with the project secret key in the `apikey` header. Store the key only in the scheduler's secret store.

The maintenance function enqueues due and orphaned Storage objects, deletes claimed objects through the Storage API, finalizes queue rows, removes read notifications older than 30 days, purges soft-deleted posts after 7 days, and reconciles cached counts.
