import { useState } from "react"
import { toast } from "sonner"

import { PendingProfileCard } from "~/components/admin/pending-profile-card"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { mockPendingProfiles } from "~/lib/admin/mock-data"
import type { PendingProfile } from "~/lib/admin/types"

// 가입 흐름의 마지막 칸. signup -> OTP -> 온보딩 -> pending 다음이 여기고, 여기가 비어 있는 동안은
// DB를 직접 만지지 않는 한 아무도 가입을 끝낼 수 없다.
//
// 그룹 관리자(space_members.role)가 아니라 **앱 관리자**(profiles.role='admin')의 화면이다.
// 서버 쪽 게이트는 이미 서 있다 -- list_pending_profiles / review_profiles 둘 다
// private.require_app_admin()으로 스스로를 잠근다.
//
// TODO(backend): 로더에서 profiles.role='admin'을 확인하고 아니면 리다이렉트한다. "권한이 없습니다"
// 화면을 그리지 말 것 -- 관리자가 아닌 사람에게 이 페이지의 존재를 알려줄 이유가 없다.
// TODO(backend): 목록은 list_pending_profiles(p_after_id, p_limit). 코드베이스에서 유일하게
// **오름차순**인 목록 RPC다(오래 기다린 신청이 위). 커서가 p_before_id가 아니라 p_after_id인 것도
// 그래서다 -- 다른 목록을 복사해 오면 조용히 뒤집힌다.
// TODO(backend): 아바타는 avatars 버킷이 private이라 서명 URL이 필요하다(createSignedUrlMap).
export default function AdminApprovalsPage() {
  const [queue, setQueue] = useState(mockPendingProfiles)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set())

  const allSelected = queue.length > 0 && selectedIds.size === queue.length

  const setSelected = (id: number, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleAll = (selected: boolean) => {
    setSelectedIds(selected ? new Set(queue.map((profile) => profile.id)) : new Set())
  }

  // TODO(backend): review_profiles(ids, status)는 **실제로 옮긴 행 수**를 돌려준다. 그 수가
  // ids.length보다 작으면 그 사이 다른 관리자가 먼저 심사한 것이므로, 낙관적 제거를 믿지 말고
  // 큐를 다시 불러온다.
  const review = (profiles: PendingProfile[], status: "accepted" | "rejected") => {
    if (profiles.length === 0) return

    const reviewed = new Set(profiles.map((profile) => profile.id))
    setQueue((current) => current.filter((profile) => !reviewed.has(profile.id)))
    setSelectedIds((current) => new Set([...current].filter((id) => !reviewed.has(id))))

    const label = status === "accepted" ? "승인" : "거절"
    const subject =
      profiles.length === 1 ? `${profiles[0].name}님을` : `${profiles.length}명의 신청을`
    toast.success(`${subject} ${label}했습니다`)
  }

  const selected = queue.filter((profile) => selectedIds.has(profile.id))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">가입 승인</h1>
        <p className="text-muted-foreground text-sm">
          {queue.length > 0
            ? `${queue.length}명이 승인을 기다리고 있습니다. 오래 기다린 신청이 위에 있습니다.`
            : "새로 가입한 사람의 학교 정보를 확인하고 승인합니다."}
        </p>
      </section>

      {queue.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-xl border px-4 py-12 text-center text-sm">
          대기 중인 신청이 없습니다.
        </p>
      ) : (
        <>
          {/* 180명짜리 큐를 스크롤하는 동안 선택이 화면 밖으로 나가면 안 된다. */}
          <div className="bg-background/95 sticky top-0 z-10 flex items-center gap-3 border-b py-3 backdrop-blur">
            <Checkbox
              checked={allSelected ? true : selectedIds.size > 0 ? "indeterminate" : false}
              onCheckedChange={(next) => toggleAll(next === true)}
              aria-label="전체 선택"
            />

            <span className="text-muted-foreground text-sm">
              {selectedIds.size > 0 ? `${selectedIds.size}명 선택됨` : "전체 선택"}
            </span>

            {selectedIds.size > 0 ? (
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => review(selected, "rejected")}>
                  거절
                </Button>
                <Button size="sm" onClick={() => review(selected, "accepted")}>
                  승인
                </Button>
              </div>
            ) : null}
          </div>

          <ul className="flex flex-col gap-2">
            {queue.map((profile) => (
              <PendingProfileCard
                key={profile.id}
                profile={profile}
                selected={selectedIds.has(profile.id)}
                onSelectedChange={(next) => setSelected(profile.id, next)}
                onApprove={() => review([profile], "accepted")}
                onReject={() => review([profile], "rejected")}
              />
            ))}
          </ul>

          {/* 거절은 차단이 아니다 -- submit_onboarding이 'rejected' 상태에서 다시 들어온다.
              심사자가 이걸 알아야 거절 버튼을 누를 수 있다. */}
          <p className="text-muted-foreground text-xs">
            거절해도 다시 신청할 수 있습니다. 정보가 잘못된 경우 거절하면 신청자가 수정해서 다시
            제출합니다.
          </p>
        </>
      )}
    </div>
  )
}
