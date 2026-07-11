// Shapes the group interior renders against. Deliberately mirrors the schema
// (supabase/schemas/02-spaces.sql, 03-content.sql) so the mock can't grow fields
// the backend won't return -- no "category"/"flair"/"featured", because spaces and
// posts have none of those.

export type GroupSpace = {
  name: string
  description: string
  /** spaces.pub_id 슬러그. 공유 링크·상세 URL(/groups/:pubId)에 실린다. */
  pubId: string
  joinPolicy: "public" | "request" | "invite_only"
  memberCount: number
  /** 현재 사용자가 이 space의 멤버인지(space_members). */
  isMember: boolean
}

export type GroupPostAuthor = {
  name: string
}

/** post_attachments의 이미지 한 장. 서명 URL은 로더가 채운다. */
export type GroupPostImage = {
  src: string
  alt: string
}

export type GroupPost = {
  id: number
  title: string
  content: string
  /** null이면 익명 글(is_anonymous) -- 작성자 신원은 내려주지 않는다. */
  author: GroupPostAuthor | null
  /** posts.pinned_at 여부. "고정" 배지로 표시. */
  isPinned: boolean
  /** ISO 8601, posts.created_at 그대로. 표시 시점에 상대시간으로 변환. */
  createdAt: string
  images: GroupPostImage[]
  /** count(*)로 읽는 파생값(캐시 컬럼 아님). */
  commentCount: number
  reactionCount: number
}
