import { useState } from "react"

import { RelativeTime } from "~/components/relative-time"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import type { GroupJoinRequest } from "~/lib/group/types"

// 관리자(owner/admin) 전용. request 정책 그룹의 가입 대기자를 승인/거절한다. 백엔드 붙기
// 전이라 승인/거절은 목록에서 제거만 한다(로컬 상태) -- approve_join_request RPC와 요청
// delete가 들어갈 자리. 대기자가 없으면 렌더하지 않는다.
export function GroupJoinRequests({ requests }: { requests: GroupJoinRequest[] }) {
  const [pending, setPending] = useState(requests)
  const dismiss = (id: number) => setPending((prev) => prev.filter((request) => request.id !== id))

  if (pending.length === 0) return null

  return (
    <section className="bg-card px-4 py-3 sm:rounded-xl sm:border sm:p-4">
      <h2 className="mb-2 text-sm font-semibold">가입 요청 {pending.length}</h2>
      <ul className="divide-border/70 flex flex-col divide-y">
        {pending.map((request) => (
          <li key={request.id} className="flex items-center gap-3 py-2">
            <Avatar>
              {request.avatarUrl ? <AvatarImage src={request.avatarUrl} alt="" /> : null}
              <AvatarFallback>{request.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{request.name}</p>
              <RelativeTime value={request.createdAt} className="text-muted-foreground text-xs" />
            </div>
            <Button size="sm" onClick={() => dismiss(request.id)}>
              승인
            </Button>
            <Button size="sm" variant="outline" onClick={() => dismiss(request.id)}>
              거절
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
