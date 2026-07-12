import { RelativeTime } from "~/components/relative-time"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import type { GroupJoinRequest } from "~/lib/group/types"

// 관리자(owner/admin) 전용. request 정책 그룹의 가입 대기자를 승인/거절한다. 승인=멤버 승격,
// 거절=목록에서 제거이며, 실제 상태 변경은 부모(group 라우트)가 한다. 저장은 백엔드 붙일 때
// (approve_join_request RPC / 요청 delete). 대기자가 없으면 렌더하지 않는다.
export function GroupJoinRequests({
  requests,
  onApprove,
  onReject,
}: {
  requests: GroupJoinRequest[]
  onApprove: (request: GroupJoinRequest) => void
  onReject: (request: GroupJoinRequest) => void
}) {
  if (requests.length === 0) return null

  return (
    <section className="bg-card px-4 py-3 sm:rounded-xl sm:border sm:p-4">
      <h2 className="mb-2 text-sm font-semibold">가입 요청 {requests.length}</h2>
      <ul className="divide-border/70 flex flex-col divide-y">
        {requests.map((request) => (
          <li key={request.id} className="flex items-center gap-3 py-2">
            <Avatar>
              {request.avatarUrl ? <AvatarImage src={request.avatarUrl} alt="" /> : null}
              <AvatarFallback>{request.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              {/* 기수를 같이 보여준다. 목록은 잘못 읽어도 다시 보면 되지만, 동명이인 중 엉뚱한
                  사람을 승인하면 그 사람이 이미 그룹 안에 들어와 있다. */}
              <p className="truncate text-sm font-medium">
                {request.name}
                {request.cohort !== null ? (
                  <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                    {request.cohort}기
                  </span>
                ) : null}
              </p>
              <RelativeTime value={request.createdAt} className="text-muted-foreground text-xs" />
            </div>
            <Button size="sm" onClick={() => onApprove(request)}>
              승인
            </Button>
            <Button size="sm" variant="outline" onClick={() => onReject(request)}>
              거절
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
