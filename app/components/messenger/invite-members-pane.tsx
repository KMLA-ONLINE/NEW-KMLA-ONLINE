import { ArrowLeftIcon, SearchIcon, UserPlusIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { cn } from "~/lib/utils"

export function InviteMembersPane({
  compact = false,
  onBack,
}: {
  compact?: boolean
  onBack: () => void
}) {
  return (
    <aside
      className={cn(
        "bg-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        !compact && "border-l"
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="그룹 정보로 돌아가기" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <p className="min-w-0 truncate text-sm font-semibold">멤버 초대</p>
      </header>

      <div className="messenger-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <section className="flex flex-col gap-4">
          <div className="relative">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="bg-muted h-10 rounded-full border-0 pl-11 shadow-none"
              placeholder="이름 또는 이메일 검색"
            />
          </div>

          <div className="text-muted-foreground flex flex-col items-center rounded-3xl border border-dashed px-5 py-8 text-center">
            <span className="bg-muted flex size-12 items-center justify-center rounded-full border">
              <UserPlusIcon className="size-5" aria-hidden="true" />
            </span>
            <p className="text-foreground mt-3 text-sm font-medium">초대할 멤버를 선택하세요</p>
          </div>
        </section>
      </div>
    </aside>
  )
}
