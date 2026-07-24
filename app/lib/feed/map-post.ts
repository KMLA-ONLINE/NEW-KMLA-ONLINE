import type { SupabaseClient } from "@supabase/supabase-js"

import type { GroupPost, GroupPostSpace } from "~/lib/group/types"
import type { Database, Json } from "~/lib/supabase/database.types"
import { createSignedUrlMap } from "~/lib/supabase/storage"

// 두 목록 RPC가 같은 글 모양을 돌려준다: list_space_posts(그룹, 단일 space라 출처가 없다)와
// list_feed_posts(홈, 출처 space가 붙는다). 차이가 그 한 컬럼뿐이라 매퍼도 하나다 -- 두 벌이면
// 같은 카드가 어느 화면에서 왔느냐에 따라 조용히 다르게 채워진다.
type SpacePostRow = Database["public"]["Functions"]["list_space_posts"]["Returns"][number]
export type PostRow = SpacePostRow & { space?: Json | null }

// jsonb 컬럼은 생성 타입에서 Json(=any에 가까움)이라, 읽기 전에 모양을 좁힌다.
type AttachmentJson = {
  storage_bucket: string
  storage_path: string
  file_name: string
  content_type: string
  /** mime_types.kind. 이미지 그리드와 파일 목록을 가르는 유일한 기준이다. */
  kind: string
  size_bytes: number | null
}

function asObject(value: Json | null | undefined): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null
}

function asAttachments(value: Json | null | undefined): AttachmentJson[] {
  return Array.isArray(value) ? (value as unknown as AttachmentJson[]) : []
}

/**
 * 목록 RPC의 행을 카드가 읽는 GroupPost로 옮긴다.
 *
 * 첨부의 storage_path는 브라우저가 그대로 못 쓴다(비공개 버킷). 페이지의 **모든** 첨부를 한 번에
 * 모아 서명하고 각 글에 되꽂는다 -- 글마다 따로 서명하면 요청이 글 수만큼 늘어난다.
 */
export async function mapPostRows(
  supabase: SupabaseClient<Database>,
  rows: PostRow[]
): Promise<GroupPost[]> {
  const urls = await createSignedUrlMap(
    supabase,
    rows.flatMap((row) => {
      const author = asObject(row.author)
      const avatarPath = typeof author?.avatar_url === "string" ? author.avatar_url : null
      return [
        ...asAttachments(row.attachments),
        ...(avatarPath ? [{ storage_bucket: "avatars", storage_path: avatarPath }] : []),
      ]
    })
  )

  return rows.map((row) => {
    const author = asObject(row.author)
    const category = asObject(row.category)
    const space = asObject(row.space)
    const attachments = asAttachments(row.attachments)

    // 출처가 붙어 있으면 이 행은 홈 피드(list_feed_posts)에서 왔다 -- 그룹 안(list_space_posts)은
    // 단일 space라 출처를 싣지 않는다. 아래 isPinned가 이걸 다시 본다.
    const sourceSpace: GroupPostSpace | null =
      typeof space?.name === "string" &&
      typeof space.pub_id === "string" &&
      (space.type === "group" || space.type === "community")
        ? { name: space.name, type: space.type, pubId: space.pub_id }
        : null

    return {
      id: row.post_id,
      pubId: row.pub_id,
      title: row.title,
      content: row.content,
      // 익명이면 서버(private.post_author)가 이미 author를 지워서 내려준다. is_mine은 익명이어도
      // 참이다 -- 내 글엔 수정/삭제가 떠야 하고, 그 사실은 남에게 새지 않는다.
      author:
        typeof author?.id === "number" && typeof author.name === "string"
          ? {
              id: author.id,
              name: author.name,
              avatarUrl:
                typeof author.avatar_url === "string"
                  ? (urls.get(author.avatar_url) ?? null)
                  : null,
            }
          : null,
      isAuthorAnonymitySuspended: row.is_author_anonymity_suspended,
      isMine: row.is_mine,
      // 고정은 **한 그룹 안에서의 정렬** 개념이다. 홈 피드는 여러 그룹을 가로지르므로 고정으로
      // 정렬하지 않고(그럴 기준이 없다), 그런데도 배지를 달면 맨 위에 있지도 않은 글이 "고정됨"
      // 이라고 말하는 거짓말이 된다. 그래서 출처가 붙은 행에서는 고정을 떨어뜨린다. RPC가
      // pinned_at을 그대로 내려주므로(list_feed_posts) 이 판단은 여기서 해야 한다.
      isPinned: row.pinned_at != null && sourceSpace === null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      category:
        typeof category?.id === "number" && typeof category.name === "string"
          ? {
              id: category.id,
              name: category.name,
              sortOrder: typeof category.sort_order === "number" ? category.sort_order : 0,
            }
          : null,
      space: sourceSpace,
      // 서명이 없는 첨부는 그릴 URL이 없으니 뺀다(깨진 이미지를 그리는 것보다 낫다).
      images: attachments.flatMap((attachment) => {
        const src = urls.get(attachment.storage_path)
        return attachment.kind === "image" && src ? [{ src, alt: attachment.file_name }] : []
      }),
      files: attachments.flatMap((attachment) => {
        const url = urls.get(attachment.storage_path)
        return attachment.kind !== "image" && url
          ? [
              {
                name: attachment.file_name,
                contentType: attachment.content_type,
                sizeBytes: attachment.size_bytes ?? 0,
                url,
              },
            ]
          : []
      }),
      commentCount: row.comment_count,
      reactionCount: row.reaction_count,
      topReactions: Array.isArray(row.top_reactions)
        ? row.top_reactions.filter((icon): icon is string => typeof icon === "string")
        : [],
    }
  })
}
