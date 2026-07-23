import { VenetianMaskIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"

const ICON_SIZE = {
  default: "size-4",
  lg: "size-5",
  sm: "size-3",
} as const

// 글·댓글 작성자의 아바타. 실명은 사진이 없으면 공통 사용자 아이콘을, 익명은 마스크 아이콘을 쓴다.
// 익명에 이니셜을 쓰면 "익명"인지 이름이 "익"으로 시작하는 실명인지 구분되지 않아, 신원을 대신하는
// 기호를 넣지 않는다.
export function GroupAuthorAvatar({
  anonymous,
  size = "default",
}: {
  name: string
  /** 서버가 author를 null로 내려줬는지(is_anonymous). 표시 이름은 익명1/익명2/글쓴이일 수 있다. */
  anonymous: boolean
  size?: keyof typeof ICON_SIZE
}) {
  return (
    <Avatar size={size === "default" ? undefined : size}>
      {/* 솔리드 primary는 피드에 익명 글이 여럿이면 너무 튄다. 살짝 낮춰 톤을 죽이되, 여전히
          "채워진 상태"로 읽히게 둔다(연한 틴트로 가면 다시 빈 아바타처럼 보인다). */}
      <AvatarFallback
        className={anonymous ? "bg-primary/80 text-primary-foreground" : "overflow-hidden"}
      >
        {anonymous ? (
          <VenetianMaskIcon className={ICON_SIZE[size]} aria-hidden="true" />
        ) : (
          <img src="/avatar.svg" alt="" className="size-full rounded-full opacity-55 dark:invert" />
        )}
      </AvatarFallback>
    </Avatar>
  )
}
