import { ArrowLeftRightIcon } from "lucide-react"

import { AnonymousAvatar, ProfileAvatar } from "~/components/profile/profile-avatar"
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip"
import { cn } from "~/lib/utils"

// 아바타 자체가 익명 ↔ 실명 토글이다. 우하단의 작은 스왑 배지가 "눌러서 바꿀 수 있다"를 알린다.
//
// 작성할 때만 바꿀 수 있다. posts.is_anonymous는 update 컬럼 grant에서 빠져 있고(comments는 애초에
// content만 열려 있다) 서버가 전환을 받아주지 않는다 -- 익명으로 쓴 글을 나중에 실명으로 까거나
// (익명을 믿고 반응한 사람들이 이미 있다), 실명 글을 뒤늦게 익명으로 숨기는(이미 본 사람은 아는데
// 새로 보는 사람만 못 보는, 반쪽짜리 익명) 전환을 둘 다 막기 위해서다. 그래서 수정 화면엔 이게 없다.
export function GroupAnonymousToggle({
  anonymous,
  onToggle,
  size,
  className,
}: {
  anonymous: boolean
  onToggle: () => void
  /** 작성 모달은 큰 아바타(lg), 댓글 컴포저는 기본 크기. */
  size?: "lg"
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={anonymous}
          aria-label={
            anonymous ? "익명으로 작성 중. 눌러서 실명으로" : "실명으로 작성 중. 눌러서 익명으로"
          }
          className={cn(
            "focus-visible:ring-ring relative shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none",
            className
          )}
        >
          {anonymous ? (
            <AnonymousAvatar size={size} />
          ) : (
            <ProfileAvatar profile={{ name: "나", avatarUrl: null }} size={size} />
          )}
          <span className="bg-background text-muted-foreground absolute -right-0.5 -bottom-0.5 flex rounded-full border p-0.5">
            <ArrowLeftRightIcon className="size-2.5" aria-hidden="true" />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{anonymous ? "익명으로 작성 중" : "실명으로 작성 중"}</TooltipContent>
    </Tooltip>
  )
}
