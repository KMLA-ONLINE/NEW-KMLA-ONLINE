import {
  AtSignIcon,
  CornerDownRightIcon,
  MailIcon,
  MessageSquareIcon,
  ShieldIcon,
  Trash2Icon,
  UserPlusIcon,
  UserRoundCheckIcon,
  UserRoundXIcon,
  VenetianMaskIcon,
} from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import { Link } from "react-router"

import { GroupAuthorAvatar } from "~/components/group/group-author-avatar"
import { RelativeTime } from "~/components/relative-time"
import { ROLE_LABEL } from "~/lib/group/format"
import type { AppNotification, NotificationType } from "~/lib/noti/types"
import { cn } from "~/lib/utils"

// 행위자가 있는 알림 -- 문장이 "누가"로 시작하고 그 자리에 아바타가 앉는다. 나머지는 모더레이션/
// 행정이라 스키마가 actor_id를 아예 금지하므로(notifications_actor_shape_check) 아바타 대신
// 아이콘 원이 그 자리에 앉는다. 행위자 유무를 actor의 null 여부로 판단하면 안 된다 -- 아래 참고.
const ACTOR_TYPES: ReadonlySet<NotificationType> = new Set([
  "post_comment",
  "comment_reply",
  "post_mention",
  "comment_mention",
  "space_join_request",
  "space_invited",
])

type Descriptor = {
  icon: ComponentType<{ className?: string }>
  /** 아이콘 원의 색. 성격(중립/승인/제재)을 색으로 먼저 읽게 한다. */
  tone: string
  /** 눌렀을 때 갈 곳. 갈 곳이 없으면 null(아래 참고). */
  href: string | null
  message: ReactNode
  /** 댓글 미리보기. 삭제된 댓글은 서버가 본문을 비워 보내므로 여기도 비어 있다. */
  snippet?: string | null
}

const TONE = {
  neutral: "bg-primary text-primary-foreground",
  positive: "bg-primary/10 text-primary",
  negative: "bg-destructive text-white",
} as const

/** 굵게 뽑는 고유명사(사람 이름, 그룹 이름). 문장에서 먼저 눈에 걸려야 하는 부분이다. */
function Em({ children }: { children: ReactNode }) {
  return <span className="font-semibold">{children}</span>
}

/**
 * 알림 한 건을 아이콘 / 문장 / 목적지로 푼다.
 *
 * 목적지가 null일 수 있는 이유: notifications_target_shape_check가 종류별로 대상을 보장하지만
 * (콘텐츠·운영 알림엔 space가, 글/댓글 알림엔 post가 항상 있다) 컬럼 자체는 nullable이라 타입도
 * nullable이다. 여기서 `!`로 단언하면 스키마가 바뀌는 날 런타임에 터지므로, 만들 수 없으면 그냥
 * 링크를 걸지 않는다.
 */
function describe(notification: AppNotification): Descriptor {
  const { actor, actorIsAnonymous, space, post, comment, payload } = notification

  const spaceName = space?.name ?? "그룹"
  const spaceHref = space ? `/groups/${space.pubId}` : null
  const postHref = space && post ? `/groups/${space.pubId}/posts/${post.pubId}` : null
  const snippet = comment?.content ?? null

  // 행위자를 조사까지 붙여 한 덩어리로 만든다 -- "익명의 사용자님이"가 되지 않게.
  //
  // actor가 null인 이유는 **두 가지**이고 둘을 뭉치면 거짓말이 된다.
  // 1) 익명으로 썼다: 서버가 actor를 지워서 내린다(actorIsAnonymous=true). 클라이언트는 애초에
  //    누군지 알 수 없다. (글 안의 "익명1/익명2" 라벨은 그 글 안에서만 유효한 번호라 알림엔 안 온다.)
  // 2) 그 프로필이 사라졌다: actor_id가 on delete set null이라 실명으로 쓴 사람이라도 계정이
  //    지워지면 null이 된다(actorIsAnonymous=false). 이걸 익명이라고 부르면, 익명이 아니었던
  //    사람을 익명이었다고 말하는 셈이다.
  const subject = actor ? (
    <>
      <Em>{actor.name}</Em>님이
    </>
  ) : actorIsAnonymous ? (
    <Em>익명의 사용자가</Em>
  ) : (
    <Em>탈퇴한 사용자가</Em>
  )

  switch (notification.type) {
    case "post_comment":
      return {
        icon: MessageSquareIcon,
        tone: TONE.neutral,
        href: postHref,
        message: <>{subject} 내 글에 댓글을 남겼습니다</>,
        snippet,
      }
    case "comment_reply":
      return {
        icon: CornerDownRightIcon,
        tone: TONE.neutral,
        href: postHref,
        message: <>{subject} 내 댓글에 답글을 남겼습니다</>,
        snippet,
      }
    case "post_mention":
      return {
        icon: AtSignIcon,
        tone: TONE.neutral,
        href: postHref,
        message: <>{subject} 글에서 나를 언급했습니다</>,
      }
    case "comment_mention":
      return {
        icon: AtSignIcon,
        tone: TONE.neutral,
        href: postHref,
        message: <>{subject} 댓글에서 나를 언급했습니다</>,
        snippet,
      }
    case "space_join_request":
      // 그룹의 가입요청 탭이 로컬 상태라 URL로 못 짚는다. 일단 그룹까지만 보낸다.
      return {
        icon: UserPlusIcon,
        tone: TONE.neutral,
        href: spaceHref,
        message: (
          <>
            {subject} <Em>{spaceName}</Em> 가입을 요청했습니다
          </>
        ),
      }
    case "space_join_approved":
      return {
        icon: UserRoundCheckIcon,
        tone: TONE.positive,
        href: spaceHref,
        message: (
          <>
            <Em>{spaceName}</Em> 가입이 승인되었습니다
          </>
        ),
      }
    case "space_join_rejected":
      return {
        icon: UserRoundXIcon,
        tone: TONE.negative,
        href: spaceHref,
        message: (
          <>
            <Em>{spaceName}</Em> 가입 요청이 거절되었습니다
          </>
        ),
      }
    case "space_invited":
      return {
        icon: MailIcon,
        tone: TONE.neutral,
        href: spaceHref,
        message: (
          <>
            {subject} <Em>{spaceName}</Em>에 초대했습니다
          </>
        ),
      }
    case "space_role_changed":
      return {
        icon: ShieldIcon,
        tone: TONE.positive,
        href: spaceHref,
        message: (
          <>
            <Em>{spaceName}</Em>에서 내 역할이{" "}
            <Em>{payload?.to ? ROLE_LABEL[payload.to] : "변경"}</Em>(으)로 바뀌었습니다
          </>
        ),
      }
    case "space_anonymity_suspended":
      return {
        icon: VenetianMaskIcon,
        tone: TONE.negative,
        href: spaceHref,
        message: (
          <>
            <Em>{spaceName}</Em>에서 익명 작성이 제한되었습니다
          </>
        ),
        snippet: payload?.suspended_until
          ? `${new Intl.DateTimeFormat("ko", { month: "long", day: "numeric", hour: "numeric" }).format(new Date(payload.suspended_until))}까지`
          : null,
      }
    case "post_removed":
      // 글은 이미 삭제됐다 -- 제목은 내가 쓴 것이라 보여줘도 되지만 링크는 걸 수 없다.
      return {
        icon: Trash2Icon,
        tone: TONE.negative,
        href: spaceHref,
        message: (
          <>
            <Em>{spaceName}</Em>에서 내 글이 삭제되었습니다
          </>
        ),
        snippet: post?.title ?? null,
      }
    case "comment_removed":
      // 원문은 오지 않는다: soft_delete_comment가 content를 비운다(tombstone이 원문을 싣지 않도록).
      return {
        icon: Trash2Icon,
        tone: TONE.negative,
        href: postHref,
        message: (
          <>
            <Em>{spaceName}</Em>에서 내 댓글이 삭제되었습니다
          </>
        ),
      }
  }
}

export function NotificationItem({
  notification,
  onRead,
}: {
  notification: AppNotification
  onRead: (id: number) => void
}) {
  const { icon: Icon, tone, href, message, snippet } = describe(notification)
  const isUnread = notification.readAt === null
  // 종류로 판단한다. actor의 null 여부로 판단하면 탈퇴한 사용자가 보낸 댓글 알림이 시스템 알림처럼
  // 보인다 -- actor_id는 on delete set null이라 사람이 있었어도 null이 될 수 있다.
  const hasActor = ACTOR_TYPES.has(notification.type)

  const body = (
    <>
      <div className="relative size-10 shrink-0">
        {hasActor ? (
          <>
            {/* 탈퇴한 사용자는 이니셜이 없다. "?"는 "이름을 알 수 없는 사람"으로 읽히고, 익명의
                마스크와도 구분된다(익명은 신원이 없는 것이지 사라진 것이 아니다). */}
            <GroupAuthorAvatar
              name={notification.actor?.name ?? "?"}
              anonymous={notification.actorIsAnonymous}
              size="lg"
            />
            {/* 아바타 위에 얹는 종류 뱃지. ring이 카드 배경색이라 아바타에서 파낸 것처럼 보인다. */}
            <span
              className={cn(
                "ring-card absolute right-0 bottom-0 z-10 flex size-5 translate-x-1/4 translate-y-1/4 items-center justify-center rounded-full ring-1",
                tone
              )}
            >
              <Icon className="size-3" />
            </span>
          </>
        ) : (
          <span className={cn("flex size-10 items-center justify-center rounded-full", tone)}>
            <Icon className="size-5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* 본문·미리보기는 글 상세와 같은 14px/leading-6이다 -- 알림함만 다른 크기를 쓸 이유가 없다. */}
        <p className="text-sm leading-6">{message}</p>
        {snippet ? (
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm leading-6">{snippet}</p>
        ) : null}
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
          {notification.space ? (
            <>
              <span className="truncate">{notification.space.name}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <RelativeTime value={notification.createdAt} className="shrink-0" />
        </p>
      </div>

      {isUnread ? (
        <span className="mt-2 shrink-0">
          <span className="bg-primary block size-2 rounded-full" aria-hidden="true" />
          <span className="sr-only">안 읽음</span>
        </span>
      ) : null}
    </>
  )

  const className = cn(
    "flex w-full gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
    isUnread ? "bg-primary/5" : null
  )

  // 갈 곳이 없으면 링크로 만들지 않는다 -- 눌러도 아무 데도 안 가는 링크는 거짓말이다.
  if (href === null) {
    return (
      <li>
        <div className={className}>{body}</div>
      </li>
    )
  }

  return (
    <li>
      <Link
        to={href}
        onClick={() => onRead(notification.id)}
        className={cn(className, isUnread ? "hover:bg-primary/10" : "hover:bg-muted/70")}
      >
        {body}
      </Link>
    </li>
  )
}
