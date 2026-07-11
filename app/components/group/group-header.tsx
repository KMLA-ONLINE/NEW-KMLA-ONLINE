import { UsersIcon } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import type { GroupSpace } from "~/lib/group/types"

const JOIN_POLICY_LABELS: Record<GroupSpace["joinPolicy"], string> = {
  public: "가입",
  request: "승인가입",
  invite_only: "초대",
}

// 커버 배너·탭(게시물/멤버/정보)·정보 aside 같은 풀 셸은 다음 단계. 지금은 이름·정책·
// 멤버수·가입 버튼만.
export function GroupHeader({ group }: { group: GroupSpace }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-lg text-lg font-semibold">
          {group.name.charAt(0)}
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold sm:text-2xl">{group.name}</h1>
            <Badge variant="secondary">{JOIN_POLICY_LABELS[group.joinPolicy]}</Badge>
          </div>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <UsersIcon className="size-3" aria-hidden="true" />
            멤버 {group.memberCount}명
          </p>
        </div>
        <Button size="sm" variant={group.isMember ? "outline" : "default"} className="ml-auto">
          {group.isMember ? "가입됨" : "가입"}
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">{group.description}</p>
    </section>
  )
}
