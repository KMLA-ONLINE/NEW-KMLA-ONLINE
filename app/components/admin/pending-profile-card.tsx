import { useState } from "react"

import { ProfileAvatar } from "~/components/profile/profile-avatar"
import { RelativeTime } from "~/components/relative-time"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Checkbox } from "~/components/ui/checkbox"
import { PROFILE_TYPE_LABEL, TRACK_LABEL, type PendingProfile } from "~/lib/admin/types"

// 심사자가 학교 명부와 대조하는 줄. 유형마다 대조할 값이 다르다 -- 학생은 학번, 교사는 부서,
// 졸업생은 기수뿐이다(스키마상 졸업생에겐 학번도 track도 없다).
function identityFacts(profile: PendingProfile): string[] {
  const facts: string[] = []

  if (profile.cohort !== null) facts.push(`${profile.cohort}기`)
  if (profile.classNo !== null) facts.push(`${profile.classNo}반`)
  if (profile.track !== null) facts.push(TRACK_LABEL[profile.track])
  if (profile.department !== null) facts.push(profile.department)
  if (profile.studentNumber !== null) facts.push(`학번 ${profile.studentNumber}`)

  return facts
}

function contactFacts(profile: PendingProfile): string[] {
  const facts: string[] = []

  if (profile.gender !== null) facts.push(profile.gender === "male" ? "남" : "여")
  // toLocaleDateString은 SSR과 클라이언트가 다른 로케일을 잡아 hydration이 깨진다. 값이 이미
  // YYYY-MM-DD라 손으로 바꾼다.
  if (profile.birthday !== null) facts.push(profile.birthday.split("-").join("."))
  if (profile.phoneNumber !== null) facts.push(profile.phoneNumber)
  if (profile.dormRoom !== null) facts.push(`기숙사 ${profile.dormRoom}호`)

  return facts
}

export function PendingProfileCard({
  profile,
  selected,
  onSelectedChange,
  onApprove,
  onReject,
}: {
  profile: PendingProfile
  selected: boolean
  onSelectedChange: (selected: boolean) => void
  onApprove: () => void
  onReject: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const identity = identityFacts(profile)
  const contact = contactFacts(profile)
  // 자기소개는 2000자까지 들어온다. 접어두되 버리지는 않는다 -- 재입학이나 전학처럼 명부와
  // 어긋나는 이유를 여기에 적어 두는 사람이 있다.
  const isLongDescription = (profile.description?.length ?? 0) > 100

  return (
    <li className="bg-card flex gap-3 rounded-xl border p-4">
      <Checkbox
        checked={selected}
        onCheckedChange={(next) => onSelectedChange(next === true)}
        aria-label={`${profile.name} 선택`}
        className="mt-1"
      />

      <ProfileAvatar profile={profile} className="size-10" />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{profile.name}</span>
            <Badge variant="secondary">{PROFILE_TYPE_LABEL[profile.type]}</Badge>
            {profile.isReenrolled ? <Badge variant="outline">재입학</Badge> : null}
          </div>

          <RelativeTime
            value={profile.submittedAt}
            className="text-muted-foreground shrink-0 text-xs"
          />
        </div>

        {identity.length > 0 ? <p className="text-sm">{identity.join(" · ")}</p> : null}

        {contact.length > 0 ? (
          <p className="text-muted-foreground text-xs">{contact.join(" · ")}</p>
        ) : null}

        {profile.description !== null ? (
          <div className="flex flex-col items-start gap-0.5">
            <p
              className={
                expanded
                  ? "text-muted-foreground text-sm whitespace-pre-wrap"
                  : "text-muted-foreground line-clamp-2 text-sm"
              }
            >
              {profile.description}
            </p>
            {isLongDescription ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
              >
                {expanded ? "접기" : "더 보기"}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={onReject}>
            거절
          </Button>
          <Button size="sm" onClick={onApprove}>
            승인
          </Button>
        </div>
      </div>
    </li>
  )
}
