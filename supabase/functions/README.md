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

## What `storage-maintenance` does

Four steps, and **the order is part of the contract: blobs go out first.**

1. **Blobs.** `enqueue_due_storage_cleanup` queues due and orphaned objects; then claim → delete through the Storage API → `complete_storage_cleanup` (or `fail_storage_cleanup`, which backs off exponentially). It loops until the queue is dry, capped at 20 rounds of 100 — a single round would drain only 100 objects per daily run, so a busy queue would never shrink. Objects are removed per bucket in one call, not one call each. A `remove` on an object that is already gone is not an error; Storage delete is idempotent, so success just means "the file is not there", which is the state we wanted.
2. **`purge_deleted_content`** — hard-deletes posts and comments soft-deleted more than 7 days ago. Rows piling up is the smaller problem; the real one is that **a deleted anonymous post keeps its `author_id` forever**, and anonymous has to stay anonymous over time.
3. **`purge_notifications`** — hard-deletes notifications created more than 30 days ago, regardless of read state.
4. **`purge_due_spaces`** — permanently removes spaces soft-deleted more than 7 days ago.

Steps 2 and 4 come after step 1 because both **skip** (rather than force) any target whose attachment rows, `spaces.image_url`, or `spaces.cover_image_url` are still set. Those references still existing mean the file is still in Storage, and deleting the DB reference first would orphan the blob forever. Skipped work is retried on the next run.

The response summary reports `enqueued`, `claimed`, `deleted`, `failed`, `purgedPosts`, `purgedComments`, `purgedNotifications`, `purgedSpaces`, `skippedSpaces`. On error it returns the summary alongside the message — partial work is already committed, so you need to know how far it got.

`cleanup_conversation` (chat) is service_role too but is **not** called here: it takes one conversation id and there is no "due" criterion for conversations. It is a manual operation.
