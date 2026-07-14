import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

export default {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    const summary = {
      enqueued: 0,
      claimed: 0,
      completed: 0,
      failed: 0,
      purgedSpaces: 0,
      skippedSpaces: 0,
    }

    const { data: enqueued, error: enqueueError } = await ctx.supabaseAdmin.rpc(
      "enqueue_due_storage_cleanup"
    )
    if (enqueueError) return Response.json({ error: enqueueError.message }, { status: 500 })
    summary.enqueued = enqueued ?? 0

    const { data: jobs, error: claimError } = await ctx.supabaseAdmin.rpc("claim_storage_cleanup", {
      p_limit: 100,
    })
    if (claimError) return Response.json({ error: claimError.message }, { status: 500 })
    summary.claimed = jobs?.length ?? 0

    for (const job of jobs ?? []) {
      const { error: removeError } = await ctx.supabaseAdmin.storage
        .from(job.storage_bucket)
        .remove([job.storage_path])
      if (removeError) {
        summary.failed++
        await ctx.supabaseAdmin.rpc("fail_storage_cleanup", {
          p_id: job.id,
          p_error: removeError.message,
        })
        continue
      }
      const { error: completeError } = await ctx.supabaseAdmin.rpc("complete_storage_cleanup", {
        p_id: job.id,
      })
      if (completeError) {
        summary.failed++
        await ctx.supabaseAdmin.rpc("fail_storage_cleanup", {
          p_id: job.id,
          p_error: completeError.message,
        })
      } else {
        summary.completed++
      }
    }

    // blob을 먼저 지운 뒤에 부른다. purge_space는 post_attachments 행이나 spaces.image_url이
    // 남아 있는 공간을 건너뛰므로(그게 파일이 아직 Storage에 있다는 뜻이다), 위 루프가 돈 다음에야
    // 같은 실행에서 그 공간이 정리된다. 건너뛴 것은 다음 실행이 다시 본다.
    const { data: cleanup, error: purgeError } = await ctx.supabaseAdmin.rpc("purge_due_spaces", {
      p_limit: 20,
    })
    if (purgeError) return Response.json({ error: purgeError.message }, { status: 500 })
    summary.purgedSpaces = cleanup?.[0]?.purged ?? 0
    summary.skippedSpaces = cleanup?.[0]?.skipped ?? 0

    return Response.json(summary)
  }),
}
