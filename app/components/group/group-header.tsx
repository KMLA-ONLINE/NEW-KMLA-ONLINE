import { MoreHorizontalIcon, UsersIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import type { GroupSpace } from "~/lib/group/types"

const JOIN_POLICY_LABELS: Record<GroupSpace["joinPolicy"], string> = {
  public: "가입",
  request: "승인가입",
  invite_only: "초대",
}

// 커버 배너 + 그 위로 겹친 그룹 아이콘. 설명은 여기 두지 않고 "그룹 정보" aside에 둔다.
export function GroupHeader({ group }: { group: GroupSpace }) {
  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <div className="from-primary/30 to-primary/5 h-32 w-full bg-linear-to-br sm:h-44" />
      <div className="flex items-start gap-3 p-4">
        <div className="bg-muted ring-card -mt-12 flex size-16 shrink-0 items-center justify-center rounded-xl text-2xl font-semibold ring-4 sm:-mt-14 sm:size-20">
          {group.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold sm:text-2xl">{group.name}</h1>
            <Badge variant="secondary">{JOIN_POLICY_LABELS[group.joinPolicy]}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
            <UsersIcon className="size-3.5" aria-hidden="true" />
            멤버 {group.memberCount}명
          </p>
        </div>
        <div className="flex items-center gap-1 pt-1">
          <Button size="sm" variant={group.isMember ? "outline" : "default"}>
            {group.isMember ? "가입됨" : "가입"}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground"
            aria-label="그룹 옵션"
          >
            <MoreHorizontalIcon className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  )
}
