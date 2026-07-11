// Shapes the group interior renders against. Deliberately mirrors the schema
// (supabase/schemas/02-spaces.sql, 03-content.sql) so the mock can't grow fields
// the backend won't return -- no "category"/"flair"/"featured", because spaces and
// posts have none of those.

export type GroupSpace = {
  name: string
  description: string
  /** spaces.space_type. group=공식, community=비공식. 이 화면은 둘 다 담는다. */
  type: "group" | "community"
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

/** 이미지가 아닌 첨부(post_attachments 중 kind가 image가 아닌 것). 이미지는 images로 나눈다. */
export type GroupPostFile = {
  /** file_name */
  name: string
  /** content_type */
  contentType: string
  /** size_bytes */
  sizeBytes: number
  /** storage_path 기반 서명 URL. 로더가 채운다. */
  url: string
}

export type GroupPost = {
  id: number
  /** posts.pub_id (uuid). 외부/공유용 식별자 -- 상세 URL은 id가 아니라 이걸로 주소한다. */
  pubId: string
  title: string
  content: string
  /** null이면 익명 글(is_anonymous) -- 작성자 신원은 내려주지 않는다. */
  author: GroupPostAuthor | null
  /** posts.pinned_at 여부. "고정" 배지로 표시. */
  isPinned: boolean
  /** ISO 8601, posts.created_at 그대로. 표시 시점에 상대시간으로 변환. */
  createdAt: string
  images: GroupPostImage[]
  /** 이미지 외 첨부 파일(post_attachments 중 kind≠image). */
  files?: GroupPostFile[]
  /** 이 글의 댓글. 개수는 comments.length로 파생 -- 별도 카운트를 두면 어긋난다. */
  comments: GroupComment[]
  /** count(*)로 읽는 파생값(캐시 컬럼 아님). */
  reactionCount: number
  /** 눌린 반응 타입 아이콘(reaction_types.icon)을 많은 순으로. 우측 요약 표시용. */
  topReactions: string[]
}

export type GroupComment = {
  id: number
  /** comments.parent_id. null이면 최상위, 값이 있으면 그 부모 댓글의 id (대댓글). */
  parentId: number | null
  /** null이면 익명 댓글(is_anonymous). */
  author: GroupPostAuthor | null
  /** 내가 쓴 댓글인지(author_id === 현재 프로필). 수정/삭제 메뉴 노출용. */
  isMine?: boolean
  content: string
  createdAt: string
}
