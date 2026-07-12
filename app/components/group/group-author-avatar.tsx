import { VenetianMaskIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"

// 아바타 크기에 맞춘 아이콘 크기. Avatar는 기본 size-8, lg는 size-10, sm은 size-6이다.
const ICON_SIZE = {
  default: "size-4",
  lg: "size-5",
  sm: "size-3",
} as const

// 글·댓글 작성자의 아바타. 익명이면 이니셜 대신 마스크 아이콘을, 회색 대신 브랜드 컬러로 채운다.
//
// 이니셜을 쓰면 익명 작성자가 "익"(익명1·익명2)이나 "글"(글쓴이)로 나와서, 아바타만 보고는 익명인지
// 이름이 "익"으로 시작하는 사람인지 구분이 안 된다. 익명은 신원이 없다는 뜻이니 신원의 자리에
// 이니셜을 넣으면 안 된다.
//
// 색을 채우는 이유는 따로 있다. AvatarFallback의 기본은 회색 원(bg-muted)인데, 그건 프로필 사진이
// 없는 일반 사용자에게도 똑같이 쓰인다. 회색 마스크는 "익명"이 아니라 "프사 없는 사람"으로 읽힌다 --
// 즉 의도된 상태가 아니라 빠진 것처럼 보인다. 채워 넣으면 익명이 부재가 아니라 상태가 된다.
export function GroupAuthorAvatar({
  name,
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
      <AvatarFallback className={anonymous ? "bg-primary/80 text-" : undefined}>
        {anonymous ? (
          <VenetianMaskIcon className={ICON_SIZE[size]} aria-hidden="true" />
        ) : (
          name.charAt(0)
        )}
      </AvatarFallback>
    </Avatar>
  )
}
