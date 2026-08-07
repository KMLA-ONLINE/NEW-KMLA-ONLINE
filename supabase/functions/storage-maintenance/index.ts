import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

// 하루 한 번 도는 정리 배치. 순서가 계약의 일부다: **blob이 먼저 나가야 한다.**
//
// 아래 두 정리(purge_deleted_content, purge_due_spaces)는 첨부 행이나 spaces.image_url/
// cover_image_url이 남아 있는 대상을 **건너뛴다**. 그 참조가 남아 있다는 건 파일이 아직 Storage에 있다는 뜻이고, 그때
// DB 행을 먼저 지우면 큐가 가리키던 참조가 사라져 blob이 영영 고아로 남기 때문이다. 그래서
// blob 루프를 먼저 끝내고 그 다음에 부른다 -- 같은 실행 안에서 이어진다.

// 큐를 마를 때까지 돈다. 한 라운드만 돌면 하루에 CLAIM_BATCH개씩만 빠지고, 업로드가 그보다
// 빠르면 큐는 영영 줄지 않는다. 다만 Edge Function은 벽시계 시간이 유한하므로 라운드 수로 잠근다
// -- 남은 것은 다음 실행이 가져간다(claim이 10분 리스를 걸어 두므로 겹치지 않는다).
const CLAIM_BATCH = 100
const MAX_ROUNDS = 20

// soft delete 7일이 지난 글·댓글의 하드 삭제. 행이 무한히 쌓이는 것도 문제지만, 더 나쁜 건
// **지운 익명 글의 author_id가 영구 보존된다**는 것이다 -- 익명은 시간이 지나도 익명이어야 한다.
const CONTENT_PURGE_LIMIT = 500

// 생성된 지 30일 지난 알림의 하드 삭제. 알림은 트리거가 자동으로 만들어 내는 유일한 행이라, 상한을
// 한 번만 태우면 하루 생성량이 상한을 넘는 순간 백로그가 영영 안 줄어든다. 그래서 아래 두 purge도
// blob 큐와 같이 "가득 찼으면 한 번 더" 라운드를 돈다.
const NOTIFICATION_PURGE_LIMIT = 1000

// soft delete 7일이 지난 공간의 영구 삭제.
const SPACE_PURGE_LIMIT = 20

type CleanupJob = { id: number; storage_bucket: string; storage_path: string }

export default {
  fetch: withSupabase({ auth: "secret" }, async (_req, ctx) => {
    const db = ctx.supabaseAdmin
    const summary = {
      enqueued: 0,
      claimed: 0,
      deleted: 0,
      failed: 0,
      purgedPosts: 0,
      purgedComments: 0,
      purgedNotifications: 0,
      purgedSpaces: 0,
      skippedSpaces: 0,
    }

    // 부분적으로 끝낸 일은 이미 커밋돼 있다. 무엇을 하고 죽었는지 알 수 있게 summary를 함께 낸다.
    const abort = (message: string) => Response.json({ error: message, summary }, { status: 500 })

    const { data: enqueued, error: enqueueError } = await db.rpc("enqueue_due_storage_cleanup")
    if (enqueueError) return abort(enqueueError.message)
    summary.enqueued = enqueued ?? 0

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data: jobs, error: claimError } = await db.rpc("claim_storage_cleanup", {
        p_limit: CLAIM_BATCH,
      })
      if (claimError) return abort(claimError.message)
      if (!jobs?.length) break
      summary.claimed += jobs.length

      // 버킷별로 묶어 한 번에 지운다. object 하나에 왕복 하나면 100개 지우는 데 100번이다.
      const byBucket = new Map<string, CleanupJob[]>()
      for (const job of jobs as CleanupJob[]) {
        const batch = byBucket.get(job.storage_bucket)
        if (batch) batch.push(job)
        else byBucket.set(job.storage_bucket, [job])
      }

      for (const [bucket, batch] of byBucket) {
        const { error: removeError } = await db.storage
          .from(bucket)
          .remove(batch.map((job) => job.storage_path))

        // 이미 없는 object는 에러가 아니다 -- remove는 멱등이다. 그러니 성공은 곧 "지금 그 파일은
        // 없다"이고, 그게 우리가 원하던 상태다. 그때 DB 참조를 끊고 큐를 닫는다.
        if (removeError) {
          summary.failed += batch.length
          await Promise.all(
            batch.map((job) =>
              db.rpc("fail_storage_cleanup", { p_id: job.id, p_error: removeError.message })
            )
          )
          continue
        }

        const completions = await Promise.all(
          batch.map(async (job) => ({
            job,
            error: (await db.rpc("complete_storage_cleanup", { p_id: job.id })).error,
          }))
        )
        const broken = completions.filter((result) => result.error)
        summary.deleted += completions.length - broken.length
        summary.failed += broken.length

        // blob은 나갔는데 DB 참조를 못 끊은 경우다. 큐에 남겨 다음 실행이 다시 시도하게 한다 --
        // 여기서 놓치면 post_attachments 행이 영원히 남아 그 글도 공간도 절대 정리되지 않는다.
        await Promise.all(
          broken.map((result) =>
            db.rpc("fail_storage_cleanup", {
              p_id: result.job.id,
              p_error: result.error?.message ?? "complete_storage_cleanup failed",
            })
          )
        )
      }
    }

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data: content, error: contentError } = await db.rpc("purge_deleted_content", {
        p_limit: CONTENT_PURGE_LIMIT,
      })
      if (contentError) return abort(contentError.message)
      const posts = content?.[0]?.purged_posts ?? 0
      const comments = content?.[0]?.purged_comments ?? 0
      summary.purgedPosts += posts
      summary.purgedComments += comments
      // 첨부가 아직 남은 글은 매 라운드 똑같이 걸러지므로 0으로 수렴한다 -- 무한 루프가 아니다.
      if (posts === 0 && comments === 0) break
    }

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data: purged, error: notificationError } = await db.rpc("purge_notifications", {
        p_limit: NOTIFICATION_PURGE_LIMIT,
      })
      if (notificationError) return abort(notificationError.message)
      summary.purgedNotifications += purged ?? 0
      if ((purged ?? 0) < NOTIFICATION_PURGE_LIMIT) break
    }

    const { data: spaces, error: spaceError } = await db.rpc("purge_due_spaces", {
      p_limit: SPACE_PURGE_LIMIT,
    })
    if (spaceError) return abort(spaceError.message)
    summary.purgedSpaces = spaces?.[0]?.purged ?? 0
    summary.skippedSpaces = spaces?.[0]?.skipped ?? 0

    return Response.json(summary)
  }),
}
