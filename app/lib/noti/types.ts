// 알림함이 렌더하는 shape. list_notifications()가 실제로 돌려주는 것과 1:1로 맞춘다
// (supabase/schemas/06-notifications.sql) -- 서버가 안 주는 필드를 mock이 지어내지 않도록.
//
// 왜 테이블이 아니라 RPC 모양인가: notifications를 직접 select해서는 이 화면을 그릴 수 없다.
// (1) actor_id의 select grant가 회수돼 있고(익명), (2) 테이블엔 내부 bigint뿐이라 딥링크에
// 필요한 pub_id가 없다. 그래서 읽기는 list_notifications() 하나로만 간다.

import type { GroupMemberRole } from "~/lib/group/types"

/**
 * notifications.type (public.notification_type).
 *
 * 이게 없으면 종류를 구분할 수 없다: "내 글에 댓글"/"내 댓글에 답글"/"댓글에서 멘션"은
 * 대상 FK 모양이 (space, post, comment)로 **완전히 같다**. 아이콘도 문구도 목적지도 다른데.
 *
 * message_mention은 enum에 값만 있고 아직 만드는 트리거가 없다(message_mentions 테이블이 없다).
 * 그래도 여기 두는 이유는 union이 DB enum과 어긋나지 않게 하려는 것이다.
 */
export type NotificationType =
  // 콘텐츠. space_members.notification_setting이 게이트한다.
  | "post_comment"
  | "comment_reply"
  | "post_mention"
  | "comment_mention"
  // 채팅.
  | "message_mention"
  // 운영. 끌 수 없다.
  | "space_join_request"
  | "space_join_approved"
  | "space_join_rejected"
  | "space_invited"
  | "space_role_changed"
  | "space_anonymity_suspended"
  | "post_removed"
  | "comment_removed"

/** 행위자. 익명이거나 시스템/모더레이션 알림이면 서버가 통째로 null로 지워서 내린다. */
export type NotificationActor = {
  /** profiles.id */
  id: number
  /** profiles.name */
  name: string
  /** profiles.avatar_url 기반 서명 URL(로더가 채움). null이면 이니셜 폴백. */
  avatarUrl: string | null
}

export type NotificationSpace = {
  /** spaces.pub_id 슬러그. 딥링크(/groups/:pubId)가 이걸로 간다. */
  pubId: string
  name: string
  type: "group" | "community"
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

export type NotificationConversation = {
  /** conversations.id. /messenger/:roomId에 실린다. */
  id: string
  /** 1:1 대화면 null(이름이 없다) -- 그때 표시명은 상대방, 즉 actor다. */
  name: string | null
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
}

export type AppNotification = {
  id: number
  type: NotificationType
  /** 익명이거나(actorIsAnonymous) 시스템/모더레이션 알림이면 null. */
  actor: NotificationActor | null
  /**
   * actor가 null인 이유가 "익명"인지 "행위자가 없음(시스템)"인지 가른다. 둘은 화면이 다르다 --
   * 익명은 마스크 아바타에 "익명의 사용자"로 뜨고, 시스템은 아바타 없이 아이콘만 뜬다.
   */
  actorIsAnonymous: boolean
  /**
   * 아래 넷은 종류에 따라 채워진다(notifications_target_shape_check가 강제).
   * 콘텐츠·운영 알림은 space가 항상 있고, 글/댓글 알림은 post가 항상 있다. 타입이 nullable인 건
   * 컬럼이 nullable이기 때문일 뿐이다.
   */
  space: NotificationSpace | null
  post: NotificationPost | null
  comment: NotificationComment | null
  conversation: NotificationConversation | null
  payload: NotificationPayload | null
  /** null이면 안 읽음. */
  readAt: string | null
  createdAt: string
}
