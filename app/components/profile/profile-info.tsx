import type { ReactNode } from "react"

import { Card, CardContent } from "~/components/ui/card"
import { formatProfileValue } from "~/lib/profile/format"
import type { MyProfile } from "~/lib/profile/types"

// 이전 화면에는 "전공"도 있었는데 그런 컬럼은 스키마에 없다 -- 저장될 곳이 없는 칸이었다.
// 학번을 뺀 나머지는 편집 모달에서 고칠 수 있다(진급·전과·부서 이동으로 실제로 바뀐다).
const SCHOOL_FIELDS = [
  { field: "student_number", label: "학번" },
  { field: "cohort", label: "기수" },
  { field: "class_no", label: "반" },
  { field: "track", label: "계열" },
  { field: "department", label: "부서" },
  { field: "dorm_room", label: "방" },
] as const

const PERSONAL_FIELDS = [
  { field: "gender", label: "성별" },
  { field: "birthday", label: "생일" },
  { field: "phone_number", label: "전화번호" },
] as const

// 이메일은 여기 없다. profiles에 컬럼이 없기도 하고(auth.users의 값), 로그인 수단이라 명부가
// 아니라 계정 설정에 속한다 -- 남의 프로필에서도 같은 화면이 뜨는데 거기 이메일이 있을 이유가 없다.
export function ProfileInfo({ profile }: { profile: MyProfile }) {
  return (
    <div className="flex flex-col gap-4">
      <InfoCard title="학교">
        {SCHOOL_FIELDS.map((item) => (
          <InfoRow
            key={item.field}
            label={item.label}
            value={formatProfileValue(profile, item.field)}
          />
        ))}
      </InfoCard>

      <InfoCard title="개인">
        {PERSONAL_FIELDS.map((item) => (
          <InfoRow
            key={item.field}
            label={item.label}
            value={formatProfileValue(profile, item.field)}
          />
        ))}
      </InfoCard>
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-0">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <dl className="divide-border/70 divide-y border-t">{children}</dl>
      </CardContent>
    </Card>
  )
}

// 값이 비었으면 "-"를 그린다. 빈 줄을 지우면 그 항목이 존재하지 않는 것처럼 보이는데,
// 여기 있는 건 전부 실제 컬럼이라 "아직 안 채웠다"와 "그런 항목이 없다"는 다른 말이다.
function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-4 px-4 py-3">
      <dt className="text-muted-foreground w-20 shrink-0 text-sm">{label}</dt>
      <dd className={value === null ? "text-muted-foreground text-sm" : "text-sm break-all"}>
        {value ?? "-"}
      </dd>
    </div>
  )
}
