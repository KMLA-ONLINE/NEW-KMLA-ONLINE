import { SchoolIcon, UserRoundIcon, type LucideIcon } from "lucide-react"

import { Card, CardContent } from "~/components/ui/card"
import { formatProfileValue } from "~/lib/profile/format"
import type { MyProfile } from "~/lib/profile/types"
import { cn } from "~/lib/utils"

// 이전 화면에는 "전공"도 있었는데 그런 컬럼은 스키마에 없다 -- 저장될 곳이 없는 칸이었다.
// 학번을 뺀 나머지는 편집 모달에서 고칠 수 있다(진급·전과·부서 이동으로 실제로 바뀐다).
//
// 히어로로 올라간 값은 여기 없다: 기수·계열·성별은 소속 pill로, 부서·방은 그 밑 메타 스트립으로
// 갔다. 같은 값을 두 곳에 두면 헤더 요약이 이 표의 복사본처럼 보인다 -- 눈에 먼저 걸릴 값은
// 헤더가, 나머지 신상은 이 표가 맡는다. 그래서 학교 표에는 학번·반만 남는다.
const SCHOOL_FIELDS = [
  { field: "student_number", label: "학번" },
  { field: "class_no", label: "반" },
] as const

const ALUMNI_SCHOOL_FIELDS = [{ field: "student_number", label: "학번" }] as const

const PERSONAL_FIELDS = [
  { field: "birthday", label: "생일" },
  { field: "phone_number", label: "전화번호" },
] as const

// 이메일은 여기 없다. profiles에 컬럼이 없기도 하고(auth.users의 값), 로그인 수단이라 명부가
// 아니라 계정 설정에 속한다 -- 남의 프로필에서도 같은 화면이 뜨는데 거기 이메일이 있을 이유가 없다.
//
// 라벨:값 표가 아니라 stacked 그리드로 그린다 -- 서식처럼 한 줄씩 늘어놓는 대신 라벨을 값 위에
// 얹어 한눈에 훑게 한다. 넓어진 데스크톱에선 두 카드를 세로로 쌓지 않고 나란히 놓아, 헤더가
// 넓어진 만큼 그 아래도 가로 폭을 쓰게 한다(모바일에선 다시 한 열로 쌓인다).
export function ProfileInfo({ profile }: { profile: MyProfile }) {
  return (
    <div className={profile.type === "teacher" ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
      {/* 히어로 다음으로 한 박자씩 늦게 떠올라, 화면이 통째로 튀지 않고 위에서 아래로 흐른다. */}
      {profile.type !== "teacher" ? (
        <FactCard
          title="학교"
          icon={SchoolIcon}
          fields={profile.type === "alumni" ? ALUMNI_SCHOOL_FIELDS : SCHOOL_FIELDS}
          profile={profile}
          delay={80}
        />
      ) : null}
      <FactCard
        title="개인"
        icon={UserRoundIcon}
        fields={PERSONAL_FIELDS}
        profile={profile}
        delay={profile.type === "teacher" ? 80 : 160}
      />
    </div>
  )
}

function FactCard({
  title,
  icon: Icon,
  fields,
  profile,
  delay,
  className,
}: {
  title: string
  icon: LucideIcon
  fields: readonly { field: Parameters<typeof formatProfileValue>[1]; label: string }[]
  profile: MyProfile
  delay: number
  className?: string
}) {
  return (
    <Card
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both py-0 shadow-none ring-0 duration-500 sm:shadow-xs sm:ring-1",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
        <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="size-4" aria-hidden="true" />
          {title}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {fields.map((item) => (
            <Fact
              key={item.field}
              label={item.label}
              value={formatProfileValue(profile, item.field)}
            />
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

// 값이 비었으면 "—"를 그린다. 칸을 지우면 그 항목이 존재하지 않는 것처럼 보이는데, 여기 있는 건
// 전부 실제 컬럼이라 "아직 안 채웠다"와 "그런 항목이 없다"는 다른 말이다 -- 빈 값은 흐리게 둔다.
function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          value === null ? "text-muted-foreground/50 text-sm" : "text-sm font-medium break-all"
        }
      >
        {value ?? "—"}
      </dd>
    </div>
  )
}
