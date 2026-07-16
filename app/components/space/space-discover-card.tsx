import { ClockIcon } from "lucide-react"
import { Link } from "react-router"

import { SpaceAvatar } from "~/components/space/space-avatar"
import { Button } from "~/components/ui/button"
import { formatMemberCount } from "~/lib/space/format"
import type { SpaceSummary } from "~/lib/space/types"

/**
 * **모르는 그룹**을 권하는 카드. 들어갈지 말지를 여기서 정해야 하므로 커버·아이콘·멤버 수·정책을
 * 다 펼친다(SpaceRow가 촘촘한 것과 일부러 반대다).
 *
 * 핀이 없는 건 디자인이 아니라 스키마다 -- 고정은 space_members.pinned_at이고, 비멤버는 그 행이
 * 없어서 고정할 대상이 없다. 가입한 뒤에야 내 목록에서 고정할 수 있다.
 */
export function SpaceDiscoverCard({
  space,
  onJoin,
}: {
  space: SpaceSummary
  /** join_space(space_id) 자리. 정책에 따라 바로 멤버가 되거나 승인 대기로 넘어간다. */
  onJoin: () => void
}) {
  return (
    <article className="bg-card flex flex-col overflow-hidden rounded-2xl border">
      {/* 커버가 없으면 그라디언트가 그대로 배너다 -- 빈 회색 사각형보다 낫다. */}
      <div className="from-primary/30 to-primary/5 h-20 w-full bg-linear-to-br">
        {space.coverImageUrl ? (
          <img src={space.coverImageUrl} alt="" className="size-full object-cover" />
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4 pt-0">
        <SpaceAvatar space={space} className="ring-card -mt-7 mb-2 size-14 text-lg ring-4" />

        {/* 이름은 자르지 않고 두 줄까지 흘린다 -- 카드에서 가장 중요한 정보를 "민사고 사진 공유 동..."
            으로 뭉개면 고를 수가 없다. 설명은 두 줄에서 끊는다. */}
        <h3 className="line-clamp-2 text-base font-semibold">{space.name}</h3>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{space.description}</p>

        <p className="text-muted-foreground mt-2 text-xs">
          <span className="tabular-nums">멤버 {formatMemberCount(space.memberCount)}명</span>
          {/* 승인제인 걸 미리 말해주지 않으면, 누른 사람이 바로 들어갈 줄 알았다가 대기 화면을 본다. */}
          {space.joinPolicy === "request" ? " · 승인 후 가입" : null}
        </p>

        {/* 가입 상태는 셋이다: 멤버 / 승인 대기 / 미가입. 대기 상태를 안 그리면 요청을 넣은 사람이
            "가입" 버튼을 계속 보고 또 누른다.
            mt-auto로 바닥에 못 박는다 -- 흐름에 두면 이름·설명이 한 줄이냐 두 줄이냐에 따라 버튼이
            위아래로 흔들려서, 나란한 카드들의 가입 버튼 높이가 제각각이 된다. */}
        <div className="mt-auto pt-4">
          {space.isMember ? (
            <Button asChild variant="outline" className="w-full">
              <Link to={`/groups/${space.pubId}`}>열기</Link>
            </Button>
          ) : space.hasPendingRequest ? (
            <Button variant="outline" className="w-full" disabled>
              <ClockIcon className="size-4" aria-hidden="true" />
              승인 대기 중
            </Button>
          ) : (
            <Button className="w-full" onClick={onJoin}>
              {space.joinPolicy === "request" ? "가입 요청" : "가입"}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
