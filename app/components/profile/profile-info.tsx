import { SchoolIcon, UserRoundIcon, type LucideIcon } from "lucide-react"

import { Card, CardContent } from "~/components/ui/card"
import { formatProfileValue } from "~/lib/profile/format"
import type { MyProfile } from "~/lib/profile/types"
import { cn } from "~/lib/utils"

const SCHOOL_FIELDS = [
  { field: "student_number", label: "학번" },
  { field: "class_no", label: "반" },
] as const

const ALUMNI_SCHOOL_FIELDS = [{ field: "student_number", label: "학번" }] as const

const PERSONAL_FIELDS = [
  { field: "birthday", label: "생일" },
  { field: "phone_number", label: "전화번호" },
] as const

export function ProfileInfo({ profile }: { profile: MyProfile }) {
  const personalFields = profile.contact_email
    ? ([...PERSONAL_FIELDS, { field: "contact_email", label: "연락처 이메일" }] as const)
    : PERSONAL_FIELDS

  return (
    <div className={profile.type === "teacher" ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
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
        fields={personalFields}
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
        "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both py-0 shadow-none ring-0 duration-500 motion-reduce:animate-none sm:shadow-xs sm:ring-1",
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
