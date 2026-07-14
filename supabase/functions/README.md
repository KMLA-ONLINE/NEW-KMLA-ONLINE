# Edge Functions

## Local

1. Start Docker Desktop and local Supabase with `npx supabase start`.
2. Apply migrations with `npx supabase db reset --local --yes`.
3. Start functions with `npx supabase functions serve`.
4. Run `powershell -ExecutionPolicy Bypass -File supabase/tests/storage_maintenance_check.ps1`.

Uploads and downloads use private Supabase Storage buckets with `storage.objects` RLS policies and client-side Supabase Storage calls. `storage-maintenance` accepts only a Supabase secret key and must never be called from a client.

The Edge Function dependency is pinned in `storage-maintenance/deno.json`. Message attachments allow the MIME types registered in `public.message_attachment_mime_types`, and the `message-files` bucket's allowlist is generated from that table. Post attachments still use the list seeded onto their bucket in the baseline migration. File content malware scanning is not performed.

## Production

Deploy after the database migrations:

```bash
npx supabase functions deploy storage-maintenance --no-verify-jwt
```

Schedule an HTTPS `POST` to `storage-maintenance` at least daily with the project secret key in the `apikey` header. Store the key only in the scheduler's secret store.

The maintenance function enqueues due and orphaned Storage objects, claims them, deletes each blob through the Storage API, and finalizes or fails the queue row. It then calls `purge_due_spaces`, which permanently removes spaces soft-deleted more than 7 days ago. That call comes last on purpose: a space is only safe to purge once its blobs are actually gone from Storage, and `purge_space` skips (rather than forces) any space whose attachment rows or `image_url` are still set. Skipped spaces are retried on the next run. The response summary reports `purgedSpaces` and `skippedSpaces` alongside the blob counters.
