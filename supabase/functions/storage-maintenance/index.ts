import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

export default {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    const summary = { enqueued: 0, claimed: 0, completed: 0, failed: 0 }

    const { data: enqueued, error: enqueueError } = await ctx.supabaseAdmin.rpc("enqueue_due_storage_cleanup")
    if (enqueueError) return Response.json({ error: enqueueError.message }, { status: 500 })
    summary.enqueued = enqueued ?? 0

    const { data: jobs, error: claimError } = await ctx.supabaseAdmin.rpc("claim_storage_cleanup", { p_limit: 100 })
    if (claimError) return Response.json({ error: claimError.message }, { status: 500 })
    summary.claimed = jobs?.length ?? 0

    for (const job of jobs ?? []) {
      const { error: removeError } = await ctx.supabaseAdmin.storage.from(job.storage_bucket).remove([job.storage_path])
      if (removeError) {
        summary.failed++
        await ctx.supabaseAdmin.rpc("fail_storage_cleanup", { p_id: job.id, p_error: removeError.message })
        continue
      }
      const { error: completeError } = await ctx.supabaseAdmin.rpc("complete_storage_cleanup", { p_id: job.id })
      if (completeError) {
        summary.failed++
        await ctx.supabaseAdmin.rpc("fail_storage_cleanup", { p_id: job.id, p_error: completeError.message })
      } else {
        summary.completed++
      }
    }

    return Response.json(summary)
  })
};
