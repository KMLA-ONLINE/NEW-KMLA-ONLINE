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
  /**
   * spaces.image_url 기반 서명 URL(로더가 채움). null이면 이니셜 폴백.
   * 쓰는 길은 finalize_space_image/clear_space_image RPC뿐이다 -- 컬럼 grant에 image_url이 없다.
   */
  imageUrl: string | null
  /**
   * spaces.cover_image_url 기반 서명 URL(로더가 채움). null이면 그라디언트 폴백.
   * 아이콘과 슬롯이 달라 버킷도 다르다(space-images / space-covers). 쓰는 길은
   * finalize_space_cover/clear_space_cover RPC뿐 -- 컬럼 grant에 없다.
   */
  coverImageUrl: string | null
  joinPolicy: "public" | "request" | "invite_only"
  /**
   * spaces.post_policy. 누가 **메인 글**을 쓸 수 있는가. 'managers'면 owner/admin/manager만 쓴다
   * (공지형 그룹). 댓글은 이 정책과 무관하게 언제나 멤버 전원에게 열려 있다 -- 공지에 달리는
   * 반응까지 잠그면 게시판이 아니라 공고문이다.
   */
  postPolicy: "all" | "managers"
  /**
   * 내가 지금 이 그룹에 글을 쓸 수 있는지(private.can_post_in_space). postPolicy가 'all'이면
   * 멤버 전원, 'managers'면 내 viewerRole이 owner/admin/manager일 때만 true. 로더가 파생한다.
   */
  canPost: boolean
  /** spaces.allow_anonymous_posts. 끄면 새 익명 글/댓글이 안 만들어진다(기존 익명 글은 그대로). */
  allowAnonymous: boolean
  /**
   * 내가 지금 이 공간에서 익명으로 쓸 수 있는지. 공간이 익명을 허용하고 + 내가 익명 정지 중이
   * 아니어야 한다. 로더가 space_anonymity_suspensions에서 **내 행만** 읽어 파생한다(RLS가 남의
   * 정지는 안 보여준다 -- 보이면 익명 글 작성자를 특정하는 통로가 된다).
   */
  canPostAnonymously: boolean
  /** 내가 익명 정지 중이면 해제 시각. 아니면 null. 왜 토글이 없는지 알려주는 데 쓴다. */
  anonymitySuspendedUntil: string | null
  memberCount: number
  /** 현재 사용자가 이 space의 멤버인지(space_members). */
  isMember: boolean
  /**
   * space_members.pinned_at 중 **내 행**. 개인 고정이라 나에게만 보이고, 목록에서 이 그룹을 맨 위로
   * 올리는 데 쓴다. posts.pinned_at(관리자가 글을 모두에게 고정)과는 다른 물건이다.
   * 쓰기는 RPC가 아니라 컬럼 grant로 직접 update한다 -- 정책이 내 행만 열어 준다.
   */
  pinnedAt: string | null
  /**
   * 현재 사용자의 이 space에서의 역할(space_members.role 중 내 행). null이면 비멤버.
   * isMember처럼 컬럼이 아니라 로더가 파생한다. owner/admin이면 관리 UI가 열린다
   * (can_manage_space 기본셋 = owner/admin).
   */
  viewerRole: GroupMemberRole | null
}

export type GroupPostAuthor = {
  name: string
}

/**
 * 이 글이 놓인 space의 최소 정보. 피드처럼 **여러 space의 글을 한 흐름에 모을 때만** 채운다 --
 * 그때 각 글이 어느 그룹에서 왔는지 알아야 하기 때문이다. 그룹 안에서는(단일 space) null이다:
 * 헤더가 이미 어느 그룹인지 말하고 있어 글마다 붙이면 잡음이다. 백엔드에선 피드 로더가
 * spaces를 조인해 내려준다(author를 조인하듯). 목록 표시에 필요한 것만 담는다.
 */
export type GroupPostSpace = {
  /** spaces.name */
  name: string
  /** spaces.space_type. group=공식, community=비공식. 출처 아이콘을 가른다. */
  type: "group" | "community"
  /** spaces.pub_id 슬러그. 출처를 누르면 /groups/:pubId 로 간다. */
  pubId: string
}

/** space_categories 한 행. 그룹이 정의하는 게시판/말머리(정보·공식·잡담 등). */
export type GroupCategory = {
  /** space_categories.id */
  id: number
  /** space_categories.name */
  name: string
  /** space_categories.sort_order (탭·칩 표시 순서) */
  sortOrder: number
}

/** space_members.role. 한 space에 owner는 정확히 1명(스키마 유니크 제약). */
export type GroupMemberRole = "owner" | "admin" | "manager" | "member"

/** space_join_requests 한 행 + 표시용 profiles 필드. request 정책 그룹의 승인 대기 가입 요청. */
export type GroupJoinRequest = {
  /** profiles.id (= space_join_requests.user_id) */
  id: number
  /** profiles.name */
  name: string
  /**
   * profiles.cohort (기수). 멤버 목록보다 여기가 더 중요하다 -- 목록은 잘못 읽어도 다시 보면
   * 되지만, 동명이인 중 엉뚱한 사람을 승인하면 그 사람이 그룹에 들어와 있다.
   */
  cohort: number | null
  /** profiles.avatar_url 기반 서명 URL(로더가 채움). null이면 이니셜 폴백. */
  avatarUrl: string | null
  /** space_join_requests.created_at (ISO 8601). */
  createdAt: string
}

/** space_members 한 행 + 표시에 필요한 profiles 필드. */
export type GroupMember = {
  /** profiles.id */
  id: number
  /** profiles.name */
  name: string
  /**
   * profiles.cohort (기수). 이름만으로는 사람을 못 가른다 -- 동명이인이 흔하고 profiles.name엔
   * 유니크 제약이 없다(그래서 @멘션도 handle 파싱이 아니라 id를 저장한다).
   * 교사 등 학생이 아닌 프로필은 기수가 없어서 null이다(profiles_student_identity_check는
   * type='student'일 때만 cohort를 요구한다).
   */
  cohort: number | null
  /** profiles.avatar_url 기반 서명 URL(로더가 채움). null이면 이니셜 폴백. */
  avatarUrl: string | null
  role: GroupMemberRole
  /** space_members.joined_at (ISO 8601). */
  joinedAt: string
  /** 현재 사용자 본인인지(표시 강조용). */
  isMe?: boolean
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
  /** 내가 쓴 글인지(author_id === 현재 프로필). 수정/삭제 메뉴 노출용. */
  isMine?: boolean
  /** posts.pinned_at 여부. "고정" 배지로 표시. */
  isPinned: boolean
  /** ISO 8601, posts.created_at 그대로. 표시 시점에 상대시간으로 변환. */
  createdAt: string
  /**
   * posts.updated_at. 없으면(null) 한 번도 수정되지 않았다 -- "수정됨" 표시는 이걸로 판단한다.
   * 서버(trg_mark_post_edited)가 제목·본문·카테고리가 **실제로 바뀐** UPDATE에만 찍는다.
   * 고정도 삭제도 여기 안 찍힌다(그건 수정이 아니다). 클라이언트는 이 값을 쓸 수 없다 --
   * update 컬럼 grant에 없다(쓸 수 있으면 수정 시각을 소급해 꾸밀 수 있다).
   * isMine처럼 "없으면 아니다"라 optional이다.
   */
  updatedAt?: string | null
  /** posts.category_id가 가리키는 그룹 카테고리(로더가 조인해 내려줌, author처럼 비정규화). null=미분류. */
  category: GroupCategory | null
  /**
   * 이 글이 어느 space에서 왔는지. **피드처럼 여러 그룹의 글을 한데 모을 때만** 채운다. 그룹
   * 내부 화면은 단일 space라 null로 두고 헤더가 그 역할을 한다. GroupPostSpace 참고.
   */
  space?: GroupPostSpace | null
  images: GroupPostImage[]
  /** 이미지 외 첨부 파일(post_attachments 중 kind≠image). */
  files?: GroupPostFile[]
  /**
   * 댓글 수. reactionCount와 같이 count(*)로 읽는 파생 스칼라(캐시 컬럼 아님, 03-content.sql).
   * 피드 로더는 글마다 이 개수만 내려주지 트리 전체를 싣지 않는다 -- 그래서 comments와 분리한다.
   */
  commentCount: number
  /** 이 글의 댓글 트리(parentId 스레드). 상세 로더만 조인해 채우는 상세 전용 필드. */
  comments?: GroupComment[]
  /** count(*)로 읽는 파생값(캐시 컬럼 아님). */
  reactionCount: number
  /** 눌린 반응 타입 아이콘(reaction_types.icon)을 많은 순으로. 우측 요약 표시용. */
  topReactions: string[]
}

export type GroupComment = {
  id: number
  /** comments.parent_id. null이면 최상위, 값이 있으면 그 부모 댓글의 id (대댓글). */
  parentId: number | null
  /**
   * 익명 댓글이거나(is_anonymous) 삭제된 댓글이면 null. 서버가 지워서 내려주므로 클라이언트에는
   * 애초에 도착하지 않는다 -- author_id는 select grant에서 빠져 있어 우회 조회도 불가능하다.
   */
  author: GroupPostAuthor | null
  /**
   * 익명 댓글의 표시 이름: "익명1", "익명2", 또는 익명 글의 글쓴이면 "글쓴이". 익명이 아니거나
   * 삭제됐으면 null. **번호는 서버가 매긴다** -- 클라이언트가 매기려면 작성자별 키가 필요한데
   * 그게 곧 author_id고, 그러면 익명이 깨진다. 번호는 그 글 안에서만 유효하다(같은 사람이 다른
   * 글에선 다른 번호를 받으므로 여러 글에 걸쳐 이어 붙일 수 없다).
   */
  anonymousLabel?: string | null
  /** 내가 쓴 댓글인지(author_id === 현재 프로필). 익명이어도 true다(수정/삭제 메뉴 노출용). */
  isMine?: boolean
  /**
   * 삭제된 댓글(tombstone). 답글이 하나라도 살아 있으면 행이 남아 계속 내려온다
   * (comments_select의 has_active_descendant) -- 안 그러면 답글 사슬이 끊긴다.
   * 이때 content와 author는 서버가 비운다. 즉 삭제된 댓글에서 알 수 있는 건 "여기 뭔가 있었다"뿐.
   */
  isDeleted?: boolean
  /** 삭제된 댓글이면 null. comments.content가 nullable인 이유다. */
  content: string | null
  createdAt: string
  /**
   * comments.updated_at. 글과 같은 계약(trg_mark_comment_edited). **삭제는 수정이 아니다** --
   * soft_delete_comment가 content를 비우지만 그때는 스탬프하지 않는다. 안 그러면 tombstone의
   * updated_at이 "삭제한 시각"이 돼 버린다.
   */
  updatedAt?: string | null
  // TODO(reactions): get_post_comments는 reaction_count, top_reactions, my_reaction_id도 반환한다.
  // 실제 반응 연동 시 reactionCount/topReactions/myReactionId를 추가하고, loader에서 camelCase로 변환한다.
}
