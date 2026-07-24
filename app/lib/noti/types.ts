// 알림함이 렌더하는 shape. list_notifications()가 실제로 돌려주는 것과 1:1로 맞춘다
// (supabase/schemas/06-notifications.sql) -- 서버가 안 주는 필드를 mock이 지어내지 않도록.
//
// 왜 테이블이 아니라 RPC 모양인가: notifications를 직접 select해서는 이 화면을 그릴 수 없다.
// (1) actor_id의 select grant가 회수돼 있고(익명), (2) 테이블엔 내부 bigint뿐이라 딥링크에
// 필요한 pub_id가 없다. 그래서 읽기는 list_notifications() 하나로만 간다.

import type { GroupMemberRole, GroupPostSpace } from "~/lib/group/types"
import type { Database } from "~/lib/supabase/database.types"

/**
 * notifications.type (public.notification_type).
 *
 * 이게 없으면 종류를 구분할 수 없다: "내 글에 댓글"/"내 댓글에 답글"/"댓글에서 멘션"은
 * 대상 FK 모양이 (space, post, comment)로 **완전히 같다**. 아이콘도 문구도 목적지도 다른데.
 *
 * 콘텐츠(post_comment·comment_reply·post_mention·comment_mention)는
 * space_members.notification_setting이 게이트하고, 나머지 운영 알림은 끌 수 없다.
 *
 * 채팅은 여기 없다. 알림함과 채팅은 별개 체계다 -- 안 읽음은 chat_read_states의 커서에서
 * 파생되고 뱃지는 get_unread_message_count()가 맡는다. 근거는 06-notifications.sql 상단.
 */
type BackendNotificationType = Database["public"]["Enums"]["notification_type"]

// TODO(backend): notification_type enum에 reaction_summary를 추가한다. 개별 반응 actor는 저장하거나
// 반환하지 않고, 같은 대상의 읽지 않은 집계 행 하나에 reaction_count를 누적한다. 읽은 뒤 들어온
// 다음 반응부터 새 행을 만든다.
export type NotificationType = BackendNotificationType | "reaction_summary"

/** 행위자. 익명이거나 시스템/모더레이션 알림이면 서버가 통째로 null로 지워서 내린다. */
export type NotificationActor = {
  id: number
  name: string
  /** avatars 버킷이 private이라 서명 URL이어야 한다(로더가 채움). null이면 공통 사용자 SVG 폴백. */
  avatarUrl: string | null
}

export type NotificationPost = {
  /** posts.pub_id (uuid). 상세 URL은 내부 id가 아니라 이걸로 주소한다. */
  pubId: string
  title: string
}

export type NotificationComment = {
  id: number
  /** 삭제된 댓글이면 null. 알림이 삭제된 댓글의 원문을 되살리지 않는다. */
  content: string | null
  isDeleted: boolean
}

/**
 * notifications.payload (jsonb). FK로 표현되지 않는 소량의 사실만 담는다.
 * 키가 snake_case인 건 서버가 jsonb_build_object로 넣은 그대로 통과하기 때문이다
 * (로더가 jsonb 내부까지 camelCase로 다시 쓰지는 않는다).
 */
export type NotificationPayload = {
  /** space_role_changed */
  from?: GroupMemberRole
  to?: GroupMemberRole
  /** space_anonymity_suspended (ISO 8601) */
  suspended_until?: string
  /** reaction_summary. 읽기 전까지 같은 대상에 누적된 새 반응 수. */
  reaction_count?: number
}

export type AppNotification = {
  id: number
  type: NotificationType
  /** 익명이거나(actorIsAnonymous) 시스템/모더레이션 알림이면 null. */
  actor: NotificationActor | null
  /**
   * required 공식 그룹에서 운영진으로 남긴 활동. TODO(backend): 원본 글·댓글의 게시 당시 귀속을
   * 알림 행에도 스냅샷하고, list_notifications는 개인 actor를 지운 채 이 값만 반환한다.
   */
  actorAttribution?: "staff" | null
  /**
   * actor가 null인 이유가 "익명"인지 "행위자가 없음(시스템)"인지 가른다. 둘은 화면이 다르다 --
   * 익명은 마스크 아바타에 "익명의 사용자"로 뜨고, 시스템은 아바타 없이 아이콘만 뜬다.
   */
  actorIsAnonymous: boolean
  /**
   * 아래 셋은 종류에 따라 채워진다(notifications_target_shape_check가 강제).
   * 콘텐츠·운영 알림은 space가 항상 있고, 글/댓글 알림은 post가 항상 있다. 타입이 nullable인 건
   * 컬럼이 nullable이기 때문일 뿐이다. 피드와 같은 최소 space 참조(GroupPostSpace)를 쓴다 --
   * pubId가 딥링크(/groups/:pubId) 대상이다.
   */
  space: GroupPostSpace | null
  post: NotificationPost | null
  comment: NotificationComment | null
  payload: NotificationPayload | null
  /** null이면 안 읽음. */
  readAt: string | null
  createdAt: string
}
