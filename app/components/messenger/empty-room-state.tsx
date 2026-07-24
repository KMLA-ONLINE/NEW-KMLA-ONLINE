import { LockIcon } from "lucide-react"

import { ConversationAvatar } from "~/components/messenger/conversation-avatar"
import { getRoomSubtitle } from "~/lib/messenger/utils"
import type { Room } from "~/lib/messenger/types"

/**
 * 메시지가 하나도 없는 방을 열었을 때, 텅 빈 화면 대신 상대 프로필을 가볍게 띄운다.
 * 1:1 방에서는 detail-pane과 동일한 문구/링크로 종단간 암호화 안내도 함께 보여준다
 * (그룹은 detail-pane의 암호화 칩과 마찬가지로 해당 없음).
 */
export function EmptyRoomState({ room }: { room: Room }) {
  const subtitle = getRoomSubtitle(room)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <ConversationAvatar room={room} className="size-20" linkProfile />
      <div>
        <h2 className="text-xl font-semibold">{room.name}</h2>
        {subtitle ? <p className="text-muted-foreground mt-0.5 text-sm">{subtitle}</p> : null}
      </div>
      {room.type === "direct" ? (
        <p className="text-muted-foreground mt-1 max-w-xs text-xs leading-relaxed text-balance">
          <LockIcon className="mr-1 inline size-3 align-[-0.125em]" aria-hidden="true" />
          메시지는 종단간 암호화로 보호됩니다. 이 채팅에 참여한 사람만 이러한 메시지를 읽을 수
          있습니다.{" "}
          <a
            href="https://www.cloudflare.com/ko-kr/learning/privacy/what-is-end-to-end-encryption/"
            target="_blank"
            rel="noreferrer"
            className="text-primary font-medium hover:underline"
          >
            더 알아보기
          </a>
        </p>
      ) : null}
    </div>
  )
}
